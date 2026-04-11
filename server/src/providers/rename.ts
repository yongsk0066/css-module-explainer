import type {
  PrepareRenameParams,
  Range as LspRange,
  RenameParams,
  WorkspaceEdit,
} from "vscode-languageserver/node";
import type { BemSuffixInfo, ScssClassMap, SelectorInfo } from "@css-module-explainer/shared";
import { findLangForPath } from "../core/scss/lang-registry";
import { fileUrlToPath, pathToFileUrl } from "../core/util/text-utils";
import { toLspRange } from "./lsp-adapters";
import { wrapHandler } from "./_wrap-handler";
import { withClassRefAtCursor } from "./cursor-dispatch";
import type { CursorParams, ProviderDeps } from "./provider-deps";
import { findSelectorAtCursor } from "./references";

/**
 * Handle `textDocument/prepareRename`.
 *
 * Returns `{ range, placeholder }` if the cursor sits on a renameable
 * class token, or `null` to reject the rename.
 *
 * Dispatches through the unified `withClassRefAtCursor` front stage.
 * Only `static` refs are renameable — template and variable refs are
 * rejected here so VS Code falls back to its default word-rename
 * behavior instead of editing a dynamic expression.
 */
export const handlePrepareRename = wrapHandler<
  PrepareRenameParams,
  [cursorParams?: CursorParams],
  { range: LspRange; placeholder: string } | null
>(
  "prepareRename",
  (params, deps, cursorParams) => {
    const filePath = fileUrlToPath(params.textDocument.uri);

    // -- SCSS-side: cursor on a selector --
    if (findLangForPath(filePath)) {
      return prepareRenameFromScss(filePath, params, deps);
    }

    // -- TS/TSX-side: needs document content --
    if (!cursorParams) return null;

    return withClassRefAtCursor(cursorParams, deps, (ctx) => {
      if (ctx.ref.kind !== "static") return null;
      return {
        range: toLspRange(ctx.ref.originRange),
        placeholder: ctx.ref.className,
      };
    });
  },
  null,
);

/**
 * Handle `textDocument/rename`.
 *
 * Builds a WorkspaceEdit with text edits across the SCSS file and
 * all referencing TS/TSX files. Only `static` class refs are
 * renameable — dynamic (template/variable) refs are skipped.
 */
export const handleRename = wrapHandler<
  RenameParams,
  [cursorParams?: CursorParams],
  WorkspaceEdit | null
>(
  "rename",
  (params, deps, cursorParams) => {
    const filePath = fileUrlToPath(params.textDocument.uri);

    // -- SCSS-side --
    if (findLangForPath(filePath)) {
      return renameFromScss(filePath, params, deps);
    }

    // -- TS/TSX-side --
    if (!cursorParams) return null;

    return withClassRefAtCursor(cursorParams, deps, (ctx) => {
      if (ctx.ref.kind !== "static") return null;
      const selectorInfo = ctx.classMap.get(ctx.ref.className);
      if (!selectorInfo) return null;
      return buildRenameEdit(
        pathToFileUrl(ctx.ref.scssModulePath),
        ctx.ref.scssModulePath,
        selectorInfo,
        deps,
        params.newName,
      );
    });
  },
  null,
);

// -- SCSS-side helpers --

/**
 * Resolve the cursor to a `SelectorInfo` and reject the nested
 * shapes that are not safe to rename (shapes outside the BEM
 * suffix set, or whose captured rawToken contains a `#{$var}`
 * interpolation). Shared by both rename entry points so the
 * BEM-safe gate exists in exactly one place.
 */
function resolveRenameTarget(
  filePath: string,
  line: number,
  character: number,
  deps: ProviderDeps,
): SelectorInfo | null {
  const classMap = deps.scssClassMapForPath(filePath);
  if (!classMap) return null;

  const selectorInfo = findSelectorAtCursor(classMap, line, character);
  if (!selectorInfo) return null;

  // Alias unwrap: Wave 2B's classnameTransform may expose an alias
  // entry at the cursor (e.g. `styles.btnPrimary` when the SCSS
  // has `.btn-primary`). The gate evaluates against the ORIGINAL
  // entry because its `bemSuffix` / `isNested` are the authoritative
  // source — the alias copies them via `...info` spread, so either
  // works in practice, but routing through originalName makes the
  // intent explicit and survives future schema changes.
  const gateTarget = selectorInfo.originalName
    ? (classMap.get(selectorInfo.originalName) ?? selectorInfo)
    : selectorInfo;
  if (gateTarget.isNested && !isBemRenameable(gateTarget)) return null;

  // camelCaseOnly / dashesOnly alias rename reject — the new name
  // would need to be reverse-transformed back to the original key
  // format to rewrite the SCSS source, but the reverse transform
  // is lossy. Initial release rejects; heuristic / explicit UI
  // may lift this in a future wave.
  const mode = deps.settings.scss.classnameTransform;
  if ((mode === "camelCaseOnly" || mode === "dashesOnly") && selectorInfo.originalName) {
    return null;
  }

  return selectorInfo;
}

/**
 * Nested entries are renameable only when the parser attached a
 * `bemSuffix` trio AND the captured `rawToken` is not part of a
 * `#{$var}` interpolation. Flat entries skip this check entirely.
 *
 * The interpolation branch is defensive — `extractClassNames`
 * already filters interpolated selector forms before they reach
 * the class map, so reaching the branch means a future parser
 * change weakened that filter.
 */
function isBemRenameable(info: SelectorInfo): info is SelectorInfo & { bemSuffix: BemSuffixInfo } {
  if (!info.bemSuffix) return false;
  if (info.bemSuffix.rawToken.includes("#{")) return false;
  return true;
}

/**
 * True if any reverse-index site for this class is a synthesized
 * expansion of a template/variable ref. `prepareRenameFromScss`
 * uses this to signal "unrenameable" to VS Code so the rename UI
 * is suppressed entirely. `renameFromScss` does not re-check —
 * `buildRenameEdit` filters individual expanded sites per-edit
 * so that even a direct rename call produces a safe edit.
 */
function hasExpandedReverseSite(deps: ProviderDeps, filePath: string, className: string): boolean {
  return deps.reverseIndex
    .findAllForScssPath(filePath)
    .some(
      (s) =>
        s.match.kind === "static" && s.match.className === className && s.expansion !== "direct",
    );
}

function prepareRenameFromScss(
  filePath: string,
  params: PrepareRenameParams,
  deps: ProviderDeps,
): { range: LspRange; placeholder: string } | null {
  const selectorInfo = resolveRenameTarget(
    filePath,
    params.position.line,
    params.position.character,
    deps,
  );
  if (!selectorInfo) return null;

  // Suppress the rename UI when the resolved class appears as an
  // expanded template/variable site — rewriting those would
  // destroy the dynamic expression source. `renameFromScss` does
  // not re-check: if a client forces the call anyway,
  // `buildRenameEdit` still filters expanded sites per-edit.
  //
  // classnameTransform extension: the reject must fire against
  // the UNION of alias name + original name. A `cx(`btn-${x}`)`
  // template produces an expanded entry for the original
  // `btn-primary` key; the alias `btnPrimary` has no entry of
  // its own, so checking only the alias would miss it.
  const keysToCheck: readonly string[] = selectorInfo.originalName
    ? [selectorInfo.name, selectorInfo.originalName]
    : [selectorInfo.name];
  for (const key of keysToCheck) {
    if (hasExpandedReverseSite(deps, filePath, key)) return null;
  }

  // Use the narrower raw-token range for nested entries (covers
  // `&--primary` exactly); flat entries keep the resolved range.
  const placeholderRange = selectorInfo.bemSuffix?.rawTokenRange ?? selectorInfo.range;
  return { range: toLspRange(placeholderRange), placeholder: selectorInfo.name };
}

function renameFromScss(
  filePath: string,
  params: RenameParams,
  deps: ProviderDeps,
): WorkspaceEdit | null {
  const selectorInfo = resolveRenameTarget(
    filePath,
    params.position.line,
    params.position.character,
    deps,
  );
  if (!selectorInfo) return null;

  return buildRenameEdit(params.textDocument.uri, filePath, selectorInfo, deps, params.newName);
}

const IDENTIFIER_RE = /^[a-zA-Z_][\w-]*$/;

/**
 * Alias-aware SCSS edit base resolver. When the cursor landed on
 * an alias entry (e.g. `btnPrimary` in camelCase mode), the SCSS
 * edit must operate on the ORIGINAL entry's `range` / `bemSuffix`
 * — the alias is a view of the original, not an independent
 * source of truth. `...info` spread in `expandClassMapWithTransform`
 * preserves both fields by reference, so in practice either entry
 * works, but routing through the original makes the intent
 * explicit and survives future schema changes.
 */
function resolveScssEditBase(
  classMap: ScssClassMap,
  selectorInfo: SelectorInfo,
): { info: SelectorInfo; name: string } {
  if (selectorInfo.originalName) {
    const original = classMap.get(selectorInfo.originalName);
    if (original) return { info: original, name: original.name };
  }
  return { info: selectorInfo, name: selectorInfo.name };
}

function buildRenameEdit(
  scssUri: string,
  scssPath: string,
  selectorInfo: SelectorInfo,
  deps: ProviderDeps,
  newName: string,
): WorkspaceEdit | null {
  if (!IDENTIFIER_RE.test(newName)) return null;

  const classMap = deps.scssClassMapForPath(scssPath);
  const scssBase = classMap
    ? resolveScssEditBase(classMap, selectorInfo)
    : { info: selectorInfo, name: selectorInfo.name };

  const scssEdit = scssBase.info.bemSuffix
    ? buildBemSuffixEdit(scssBase.info.bemSuffix, scssBase.info.name, newName)
    : { range: toLspRange(scssBase.info.range), newText: newName };
  if (!scssEdit) return null;

  const changes: Record<string, Array<{ range: LspRange; newText: string }>> = {
    [scssUri]: [scssEdit],
  };
  // Reference edits union over [primaryName, aliasName]. When the
  // cursor is on a flat/non-alias entry, aliasName is null and the
  // call collapses to the Wave 2A single-key behavior.
  const aliasName =
    selectorInfo.originalName && selectorInfo.name !== scssBase.name ? selectorInfo.name : null;
  collectReferenceEdits(deps, scssPath, scssBase.name, aliasName, newName, changes);
  return { changes };
}

/**
 * Append TS/TSX reference edits to `changes` for every direct
 * reverse-index site of the given class. `expansion !== "direct"`
 * sites are skipped — those are synthesized from template/variable
 * refs and rewriting them would destroy the dynamic expression
 * source. Find References still surfaces expanded sites; only
 * rename filters.
 *
 * classnameTransform extension: when `aliasName` is non-null, the
 * union over [primaryName, aliasName] is walked and the `seen`
 * Set dedups any site that shows up under both lookups. In the
 * common case where the same TS file uses both `styles.btnPrimary`
 * (alias key) and `cx('btn-primary')` (original key), each site
 * rewrites exactly once with the caller-supplied `newName`.
 */
function collectReferenceEdits(
  deps: ProviderDeps,
  scssPath: string,
  primaryName: string,
  aliasName: string | null,
  newName: string,
  changes: Record<string, Array<{ range: LspRange; newText: string }>>,
): void {
  const keys = aliasName !== null ? [primaryName, aliasName] : [primaryName];
  const seen = new Set<string>();
  for (const key of keys) {
    for (const site of deps.reverseIndex.find(scssPath, key)) {
      if (site.expansion !== "direct") continue;
      const sig = `${site.uri}:${site.range.start.line}:${site.range.start.character}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      (changes[site.uri] ??= []).push({
        range: toLspRange(site.range),
        newText: newName,
      });
    }
  }
}

/**
 * Build the surgical SCSS edit for a BEM-suffix nested entry:
 * rewrites only the `--x` / `__x` slice inside the raw token,
 * leaving the enclosing `.parent { &` untouched.
 *
 * Rejects cross-parent renames (`button--primary → banner--tiny`),
 * no-op renames, and empty-suffix renames (which would collapse
 * the nested rule to a bare `&`).
 */
function buildBemSuffixEdit(
  bemSuffix: BemSuffixInfo,
  oldName: string,
  newName: string,
): { range: LspRange; newText: string } | null {
  const { parentResolvedName: parent, rawToken, rawTokenRange: rawRange } = bemSuffix;

  // Cross-parent rename is out of scope — both sides must live
  // under the same bare-class parent.
  if (!oldName.startsWith(parent)) return null;
  if (!newName.startsWith(parent)) return null;

  const oldSuffix = oldName.slice(parent.length);
  const newSuffix = newName.slice(parent.length);

  if (oldSuffix === newSuffix) return null;
  if (newSuffix.length === 0) return null;

  // Parser invariant: rawToken === "&" + oldSuffix, so the suffix
  // starts at index 1 inside rawToken. The check below preserves
  // a clean failure if a future parser change violates that.
  const suffixOffset = rawToken.indexOf(oldSuffix);
  if (suffixOffset !== 1) return null;

  const suffixRange: LspRange = {
    start: {
      line: rawRange.start.line,
      character: rawRange.start.character + suffixOffset,
    },
    end: {
      line: rawRange.start.line,
      character: rawRange.start.character + suffixOffset + oldSuffix.length,
    },
  };
  return { range: suffixRange, newText: newSuffix };
}
