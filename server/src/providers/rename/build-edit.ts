import type { Range as LspRange } from "vscode-languageserver/node";
import type { BemSuffixInfo } from "@css-module-explainer/shared";
import { findSelectorReferenceSites } from "../../core/query/find-references";
import { findCanonicalSelector } from "../../core/query/find-style-selector";
import {
  type ClassnameTransformMode,
  transformClassname,
} from "../../core/scss/classname-transform";
import type { SelectorDeclHIR, StyleDocumentHIR } from "../../core/hir/style-types";
import { toLspRange } from "../lsp-adapters";
import type { ProviderDeps } from "../provider-deps";

const IDENTIFIER_RE = /^[a-zA-Z_][\w-]*$/;

/**
 * Resolve the canonical entry + canonical name for a cursor hit.
 * When the cursor landed on an alias view (e.g. `btnPrimary` in
 * camelCase mode), the SCSS edit must operate on the ORIGINAL
 * entry's `range` / `bemSuffix`, and the shared reference query must
 * use the ORIGINAL key so every access form (original and alias)
 * is rewritten by a single rename.
 */
function canonicalForm(
  styleDocument: StyleDocumentHIR,
  selector: SelectorDeclHIR,
): SelectorDeclHIR {
  return findCanonicalSelector(styleDocument, selector);
}

export function buildRenameEdit(
  scssUri: string,
  scssPath: string,
  styleDocument: StyleDocumentHIR,
  selector: SelectorDeclHIR,
  deps: ProviderDeps,
  newName: string,
): { changes: Record<string, Array<{ range: LspRange; newText: string }>> } | null {
  if (!IDENTIFIER_RE.test(newName)) return null;

  const canonical = canonicalForm(styleDocument, selector);

  const scssEdit = canonical.bemSuffix
    ? buildBemSuffixEdit(canonical.bemSuffix, canonical.name, newName)
    : { range: toLspRange(canonical.range), newText: newName };
  if (!scssEdit) return null;

  const changes: Record<string, Array<{ range: LspRange; newText: string }>> = {
    [scssUri]: [scssEdit],
  };
  collectReferenceEdits(
    deps,
    scssPath,
    canonical.canonicalName,
    newName,
    deps.settings.scss.classnameTransform,
    changes,
  );
  return { changes };
}

/**
 * Append TS/TSX reference edits to `changes` for every direct
 * reference site keyed under the canonical SCSS class name.
 * Template/variable expansions are skipped — rewriting them would
 * destroy the dynamic expression source.
 *
 * Each site stores the class token as-written (`match.className`)
 * plus its `canonicalName`. When the two match, the site uses
 * the original form and the raw `newName` is written. When they
 * differ, the site accessed the class via an alias form (e.g.
 * `styles.btnPrimary` resolving to `.btn-primary` under
 * `camelCase`), and `newName` is forwarded through
 * `transformClassname` so the rewrite keeps the alias format
 * — `styles.btnHero` instead of the invalid `styles.btn-hero`.
 */
function collectReferenceEdits(
  deps: ProviderDeps,
  scssPath: string,
  canonicalName: string,
  newName: string,
  mode: ClassnameTransformMode,
  changes: Record<string, Array<{ range: LspRange; newText: string }>>,
): void {
  for (const site of findSelectorReferenceSites(deps, scssPath, canonicalName, {
    includeExpanded: false,
  })) {
    const written = site.className;
    const newText = written === canonicalName ? newName : (pickAliasForm(mode, newName) ?? newName);
    (changes[site.uri] ??= []).push({
      range: toLspRange(site.range),
      newText,
    });
  }
}

/**
 * Given a user-supplied `newName` in its canonical (dashed)
 * form, pick the alias form produced by the current
 * `classnameTransform` mode. Returns `null` when no alias form
 * is distinct from the input (e.g., the user typed a name that
 * already matches the alias shape, or `asIs` mode is active).
 */
function pickAliasForm(mode: ClassnameTransformMode, newName: string): string | null {
  const forms = transformClassname(mode, newName);
  for (const form of forms) {
    if (form !== newName) return form;
  }
  return null;
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
