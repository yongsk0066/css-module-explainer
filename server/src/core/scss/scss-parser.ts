import type {
  BemSuffixInfo,
  ComposesRef,
  Range,
  ScssClassMap,
  SelectorInfo,
} from "@css-module-explainer/shared";
import { parse as postcssParse, type AtRule, type ChildNode, type Root, type Rule } from "postcss";
import { findLangForPath, getRuntimeSyntax } from "./lang-registry";

/**
 * Parse a CSS Module file into a map of class name → SelectorInfo.
 *
 * Parsing is best-effort: a parse error produces an empty map, never
 * throws. The caller (StyleIndexCache) treats an empty map as a
 * legitimate "no classes found" result, so upstream providers keep
 * running even when one file is broken.
 */
/**
 * Context threaded through the recursive SCSS walk. Carries the
 * resolved parent selector plus a narrower view for `&`-nested
 * rename support: `className` is set iff the parent rule is a
 * bare single `.classname`, and `isGrouped` tracks whether the
 * parent rule had `selectors.length > 1`.
 *
 * `className` flows into `bemSuffix.parentResolvedName` for
 * BEM-safe nested entries; the rename provider reads it to
 * drive suffix-math edits.
 */
export interface ParentContext {
  readonly selector: string;
  readonly className?: string;
  readonly isGrouped?: boolean;
}

/**
 * Build the child recursion context from a parent rule's resolved
 * selectors and one specific child branch.
 *
 * Sets `className` only when the **current branch** is a bare
 * single class (`.foo`) AND the parent rule was not grouped —
 * otherwise `className` is undefined so rename-safe-nested
 * entries reject downstream.
 *
 * Exported for unit testing of the context derivation logic.
 */
export function buildChildContext(
  resolvedSelectors: readonly string[],
  nextResolved: string,
): ParentContext {
  const classesInParent = extractClassNames(nextResolved);
  const isBareSingleClass =
    resolvedSelectors.length === 1 &&
    classesInParent.length === 1 &&
    nextResolved === "." + classesInParent[0];
  const ctx: ParentContext = {
    selector: nextResolved,
    ...(isBareSingleClass ? { className: classesInParent[0] } : {}),
    ...(resolvedSelectors.length > 1 ? { isGrouped: true } : {}),
  };
  return ctx;
}

export function parseStyleModule(content: string, filePath: string): ScssClassMap {
  const classMap = new Map<string, SelectorInfo>();

  const lang = findLangForPath(filePath);
  // shared.StyleLang.syntax is typed as `unknown` so the shared
  // module stays runtime-free. The narrowing cast lives in
  // `getRuntimeSyntax` (the single documented `as` cast).
  const syntax = lang ? getRuntimeSyntax(lang) : null;

  // postcss's top-level `parse` is hardcoded to the CSS grammar
  // and silently ignores `opts.syntax`. Delegate to the Syntax
  // object's own `.parse` when one is provided (SCSS, LESS, …)
  // so non-CSS features — `//` line comments, `#{...}`
  // interpolation, SASS directives — actually reach the right
  // grammar. Plain CSS falls back to the top-level postcss parser
  // because `lang-registry` records `syntax: null` for it.
  const parse = typeof syntax?.parse === "function" ? syntax.parse.bind(syntax) : postcssParse;
  let root: Root;
  try {
    root = parse(content, { from: filePath }) as Root;
  } catch {
    // Parse failure → empty map; contract is documented on the
    // parseStyleModule JSDoc above. We intentionally do not log
    // here because StyleIndexCache will retry on the next content
    // change, and diagnostics for broken CSS modules are the diagnostics provider's
    // responsibility (via a dedicated diagnostic category).
    return classMap;
  }

  // postcss's root.nodes is typed as ChildNode[] | Root_[] at the
  // Document level, but at Root level it is ChildNode[]. Narrow
  // by walking children directly.
  walkStyleNodes(root.nodes as ChildNode[], { selector: "" }, classMap);
  return classMap;
}

/**
 * Recurse through postcss nodes, recording classes that CSS Modules
 * exposes on the `styles` object. Transparent at-rules (@media,
 * @supports, @at-root) are unwrapped; @keyframes/@font-face are skipped.
 */
function walkStyleNodes(
  nodes: ChildNode[] | undefined,
  parentCtx: ParentContext,
  classMap: Map<string, SelectorInfo>,
): void {
  if (!nodes) return;
  for (const node of nodes) {
    if (node.type === "rule") {
      // :global block form — `rule.selector === ":global"` means
      // every child class is global-scoped and must be excluded.
      if (isGlobalBlockRule(node.selector)) continue;
      // :local block form — passthrough (CSS Modules default is
      // local, so these are already correctly indexed).
      if (isLocalBlockRule(node.selector)) {
        walkStyleNodes(node.nodes, parentCtx, classMap);
        continue;
      }
      recordRule(node, parentCtx, classMap);
    } else if (node.type === "atrule" && isTransparentAtRule(node.name)) {
      if (node.name === "at-root" && isInlineAtRoot(node)) {
        recordAtRootInlineRule(node, classMap);
      } else if (node.name === "at-root") {
        // Block form `@at-root { .escaped {} }` — resets the
        // parent selector so nested rules escape all enclosing
        // nesting, which is the entire point of @at-root.
        walkStyleNodes(node.nodes, { selector: "" }, classMap);
      } else {
        walkStyleNodes(node.nodes, parentCtx, classMap);
      }
    }
  }
}

function isTransparentAtRule(name: string): boolean {
  return name === "media" || name === "at-root" || name === "supports" || name === "layer";
}

function isGlobalBlockRule(selector: string): boolean {
  return /^:global\s*$/.test(selector.trim());
}

function isLocalBlockRule(selector: string): boolean {
  return /^:local\s*$/.test(selector.trim());
}

function isInlineAtRoot(atrule: AtRule): boolean {
  // Inline form: `@at-root .escaped { ... }` — postcss-scss puts the
  // selector in `params`. Block form: `@at-root { ... }` — `params`
  // is empty.
  return atrule.params.trim().length > 0;
}

/**
 * Split a selector source on top-level commas, tracking the offset
 * of each group within the original string. Unlike `rule.selectors`
 * (which loses per-group offsets), this walker respects paren depth
 * so commas inside `:is(.a, .b)` or `:not(.c, .d)` are preserved.
 *
 * Exported for unit testing.
 */
export function enumerateGroups(selectorSource: string): Array<{ raw: string; offset: number }> {
  const groups: Array<{ raw: string; offset: number }> = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < selectorSource.length; i++) {
    const ch = selectorSource[i];
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === "," && depth === 0) {
      groups.push({ raw: selectorSource.slice(start, i).trim(), offset: start });
      start = i + 1;
    }
  }
  groups.push({ raw: selectorSource.slice(start).trim(), offset: start });
  return groups;
}

/**
 * Locate the BEM suffix fragment (`&--x` or `&__x`) inside a
 * raw nested selector group and convert its source offsets to
 * a 0-based LSP `Range`.
 *
 * Precondition (caller-enforced): called only when the raw group
 * is known to be nested (contains `&`) and to contain exactly one
 * `&`. Returns `null` for any shape that is not a safe BEM suffix:
 * compound (`&.active`), pseudo (`&:hover`), attribute (`&[x]`),
 * id (`&#foo`), combinator-before (`.a &--x`, `.a&--x`, etc.),
 * descendant-after (`&--x .y`), trailing compound (`&--x.other`).
 *
 * Exported for unit testing.
 */
export function findBemSuffixSpan(
  rule: Rule,
  groupOffset: number,
  rawGroup: string,
): { rawToken: string; range: Range } | null {
  const src = rule.source;
  if (!src?.start) return null;
  const startOffset = src.start.offset;

  const ampIndex = rawGroup.indexOf("&");
  if (ampIndex < 0) return null;
  const groupAbsOffset = startOffset + groupOffset;

  // Nothing before the `&`: rejects combinator-before (`.a &--x`),
  // immediate-compound prefix (`.a&--x`, `#id&--x`, `[x]&--x`),
  // and any non-whitespace prefix.
  if (rawGroup.slice(0, ampIndex).trim() !== "") return null;

  // Tail must start with `--<name>` or `__<name>`.
  const tail = rawGroup.slice(ampIndex + 1);
  const match = /^(--|__)[a-zA-Z_][\w-]*/.exec(tail);
  if (!match) return null;

  const fragment = "&" + match[0];

  // Must be the last non-whitespace token in the group. Rejects
  // descendant-after (`&--x .y`), trailing compound (`&--x.other`),
  // trailing comments, etc.
  if (rawGroup.slice(ampIndex + fragment.length).trim() !== "") return null;

  const tokenStartOffset = groupAbsOffset + ampIndex;
  const tokenEndOffset = tokenStartOffset + fragment.length;

  const startPos = src.input.fromOffset(tokenStartOffset);
  const endPos = src.input.fromOffset(tokenEndOffset);
  if (!startPos || !endPos) return null;

  return {
    rawToken: fragment,
    range: {
      start: { line: startPos.line - 1, character: startPos.col - 1 },
      end: { line: endPos.line - 1, character: endPos.col - 1 },
    },
  };
}

function recordRule(
  rule: Rule,
  parentCtx: ParentContext,
  classMap: Map<string, SelectorInfo>,
): void {
  const { declarations, composes } = collectDeclarationsAndComposes(rule.nodes);
  const ruleRange = rangeForSourceNode(rule);

  // Use enumerateGroups on the verbatim selector source so each
  // group carries its offset relative to rule.source.start.
  // rule.raws.selector?.raw preserves comments/whitespace stripped
  // from rule.selector.
  const selectorSource = rule.raws.selector?.raw ?? rule.selector;
  const groups = enumerateGroups(selectorSource);
  const resolvedSelectors: string[] = [];

  for (const { raw, offset } of groups) {
    const resolved = resolveSelector(raw, parentCtx.selector);
    resolvedSelectors.push(resolved);
    const bemSuffix = classifyBemSuffixSite(rule, raw, offset, parentCtx, groups.length);
    const isNested = raw.includes("&");

    for (const className of extractClassNames(resolved)) {
      // Dedup guard: don't downgrade a flat parent entry to nested
      // by overwriting it with a nested variant. Prevents
      // `.button { &:hover {} }` from flipping `.button`'s isNested
      // flag and silently rejecting rename on the flat parent.
      const existing = classMap.get(className);
      if (existing && existing.isNested !== true && isNested) continue;

      classMap.set(
        className,
        buildSelectorInfoEntry({
          className,
          resolved,
          raw,
          rule,
          declarations,
          composes,
          ruleRange,
          isNested,
          bemSuffix,
        }),
      );
    }
  }

  // Recurse into nested rules under EVERY grouped selector, not
  // just the first. `.a, .b { .child {} }` → both `.a .child` and
  // `.b .child` are indexed.
  const parents = resolvedSelectors.length > 0 ? resolvedSelectors : [parentCtx.selector];
  for (const nextResolved of parents) {
    walkStyleNodes(rule.nodes, buildChildContext(resolvedSelectors, nextResolved), classMap);
  }
}

/**
 * Classify whether a raw selector group is a BEM-safe nested
 * rename target and, if so, return the `BemSuffixInfo` the parser
 * should attach to the resulting map entry.
 *
 * All six conditions must hold:
 *   1. the group is nested (contains `&`)
 *   2. it contains exactly one `&`
 *   3. the parent rule is a bare single class
 *   4. the parent rule is not grouped
 *   5. the CURRENT rule is not grouped (groups.length === 1)
 *   6. `findBemSuffixSpan` returns a non-null span (pure BEM
 *      suffix form — `&--x` or `&__x`, last token in group,
 *      nothing before the `&`)
 *
 * Returns `null` for any non-BEM-safe shape. The caller still
 * marks the entry with `isNested: true` when applicable; this
 * function only decides whether the surgical-rename trio can
 * be produced.
 */
function classifyBemSuffixSite(
  rule: Rule,
  raw: string,
  groupOffset: number,
  parentCtx: ParentContext,
  groupsLength: number,
): BemSuffixInfo | null {
  if (!raw.includes("&")) return null;
  const ampCount = raw.match(/&/g)?.length ?? 0;
  if (ampCount !== 1) return null;
  if (parentCtx.className === undefined) return null;
  if (parentCtx.isGrouped === true) return null;
  if (groupsLength !== 1) return null;

  const span = findBemSuffixSpan(rule, groupOffset, raw);
  if (!span) return null;

  return {
    rawToken: span.rawToken,
    rawTokenRange: span.range,
    parentResolvedName: parentCtx.className,
  };
}

interface BuildEntryArgs {
  readonly className: string;
  readonly resolved: string;
  readonly raw: string;
  readonly rule: Rule;
  readonly declarations: string;
  readonly composes: readonly ComposesRef[];
  readonly ruleRange: Range;
  readonly isNested: boolean;
  readonly bemSuffix: BemSuffixInfo | null;
}

function buildSelectorInfoEntry(args: BuildEntryArgs): SelectorInfo {
  const tokenRange = findClassTokenRange(args.rule.source?.start, args.className, args.raw);
  return {
    name: args.className,
    range: tokenRange,
    fullSelector: args.resolved,
    declarations: args.declarations,
    ruleRange: args.ruleRange,
    ...(args.composes.length > 0 ? { composes: args.composes } : {}),
    ...(args.isNested ? { isNested: true } : {}),
    ...(args.bemSuffix ? { bemSuffix: args.bemSuffix } : {}),
  };
}

/**
 * Collect declarations AND composes references from a rule's
 * direct children. `composes` declarations are extracted into
 * structured `ComposesRef` objects; all other declarations are
 * flattened into the `"prop: value; ..."` string.
 */
function collectDeclarationsAndComposes(nodes: ChildNode[] | undefined): {
  declarations: string;
  composes: ComposesRef[];
} {
  if (!nodes) return { declarations: "", composes: [] };

  const composes: ComposesRef[] = [];
  const declParts: string[] = [];

  for (const node of nodes) {
    if (node.type !== "decl") continue;
    if (node.prop === "composes") {
      const ref = parseComposesValue(node.value);
      if (ref) composes.push(ref);
    } else {
      declParts.push(`${node.prop}: ${node.value}`);
    }
  }

  return { declarations: declParts.join("; "), composes };
}

const COMPOSES_FROM_RE = /^(.+?)\s+from\s+(?:'([^']+)'|"([^"]+)"|(global))\s*$/;

function parseComposesValue(value: string): ComposesRef | null {
  const trimmed = value.trim();
  const match = COMPOSES_FROM_RE.exec(trimmed);
  if (match) {
    const classNames = match[1]!.trim().split(/\s+/);
    const from = match[2] ?? match[3];
    const fromGlobal = match[4] === "global" || undefined;
    return { classNames, ...(from ? { from } : {}), ...(fromGlobal ? { fromGlobal } : {}) };
  }
  // Same-file composes: `composes: className`
  const classNames = trimmed.split(/\s+/).filter((s) => s.length > 0);
  return classNames.length > 0 ? { classNames } : null;
}

/**
 * Record a class map entry for the inline `@at-root <selector> { ... }`
 * form. The at-root atrule carries the selector in `params` and its
 * declarations as direct children. Because @at-root escapes all
 * enclosing nesting, the parent selector is intentionally dropped.
 */
function recordAtRootInlineRule(atrule: AtRule, classMap: Map<string, SelectorInfo>): void {
  const selector = atrule.params.trim();
  const { declarations } = collectDeclarationsAndComposes(atrule.nodes);
  const ruleRange = rangeForSourceNode(atrule);
  const selectors = selector.split(",").map((s) => s.trim());

  for (const raw of selectors) {
    for (const className of extractClassNames(raw)) {
      const start = atrule.source?.start;
      const baseColumn = (start?.column ?? 1) - 1 + "@at-root ".length;
      classMap.set(className, {
        name: className,
        range: atRootTokenRange(start?.line ?? 1, baseColumn, className, raw),
        fullSelector: raw,
        declarations,
        ruleRange,
      });
    }
  }
}

/**
 * Resolve a raw selector against its parent selector the way SCSS
 * does:
 *   parent ".button", raw "&--primary" → ".button--primary"
 *   parent ".card",   raw ".inner"      → ".card .inner"
 *   parent "",        raw ".top"        → ".top"
 */
function resolveSelector(raw: string, parent: string): string {
  const trimmed = raw.trim();
  if (parent === "") return trimmed;
  if (trimmed.includes("&")) {
    return trimmed.replace(/&/g, parent);
  }
  return `${parent} ${trimmed}`;
}

/**
 * Extract class names from a resolved selector. Strips :global
 * (dropped), :local (unwrapped), and pseudos, then returns every
 * class in the rightmost compound segment.
 */
function extractClassNames(resolvedSelector: string): string[] {
  // (1) + (2) + (3) — strip wrappers and pseudos.
  const withoutGlobal = resolvedSelector.replace(/:global\s*\(\s*[^)]*\)/g, "");
  const withoutLocal = withoutGlobal.replace(/:local\s*\(\s*([^)]*)\s*\)/g, "$1");
  const withoutPseudos = withoutLocal.replace(/::?[a-zA-Z-]+(?:\([^)]*\))?/g, "");

  // (4) — keep only the rightmost compound segment. Combinators
  // that split compounds are whitespace, `>`, `+`, `~`.
  const segments = withoutPseudos.trim().split(/\s*[>+~]\s*|\s+/);
  const lastSegment = segments[segments.length - 1] ?? "";
  // Unicode property classes so identifiers outside the ASCII
  // subset (e.g. `.한글`, `.日本語`, `.español-btn`, or the NFD
  // form `.café` where `é` is `e` + U+0301) survive the last-
  // compound split. First character: letter or underscore.
  // Remainder: letter, number, combining mark, underscore, dash —
  // `\p{M}` picks up combining marks so a decomposed codepoint
  // does not truncate the identifier at the base letter.
  const matches = lastSegment.match(/\.[\p{L}_][\p{L}\p{N}\p{M}_-]*/gu) ?? [];
  return matches.map((m) => m.slice(1));
}

/**
 * Word-boundary-aware class token offset finder.
 *
 * `".btn-primary .btn".indexOf(".btn")` returns `0`, pointing at
 * the `btn` *inside* `btn-primary` — wrong. We anchor the match
 * on `(?![\w-])` so `btn` won't match inside `btn-primary`.
 */
function findClassOffset(rawSelector: string, className: string): number {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\.${escaped}(?![\\w-])`);
  const match = re.exec(rawSelector);
  return match?.index ?? -1;
}

function findClassTokenRange(
  sourceStart: { line: number; column: number } | undefined,
  className: string,
  rawSelector: string,
): Range {
  if (!sourceStart) return zeroRange();
  const line = sourceStart.line - 1;
  const offset = findClassOffset(rawSelector, className);
  const baseCol = sourceStart.column - 1;
  const character = offset >= 0 ? baseCol + offset + 1 : baseCol;
  return {
    start: { line, character },
    end: { line, character: character + className.length },
  };
}

function atRootTokenRange(
  startLine: number,
  baseColumn: number,
  className: string,
  rawSelector: string,
): Range {
  const line = startLine - 1;
  const offset = findClassOffset(rawSelector, className);
  const character = offset >= 0 ? baseColumn + offset + 1 : baseColumn;
  return {
    start: { line, character },
    end: { line, character: character + className.length },
  };
}

function rangeForSourceNode(node: Rule | AtRule): Range {
  const start = node.source?.start;
  const end = node.source?.end;
  return {
    start: start
      ? { line: start.line - 1, character: start.column - 1 }
      : { line: 0, character: 0 },
    end: end ? { line: end.line - 1, character: end.column - 1 } : { line: 0, character: 0 },
  };
}

function zeroRange(): Range {
  return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
}
