import type {
  BemSuffixInfo,
  ComposesRef,
  Range,
  ScssClassMap,
  SelectorInfo,
} from "@css-module-explainer/shared";
import { parse as postcssParse, type AtRule, type ChildNode, type Root, type Rule } from "postcss";
import { classifyBemSuffixSite } from "./bem-suffix";
import { findLangForPath, getRuntimeSyntax } from "./lang-registry";
import {
  atRootTokenRange,
  enumerateGroups,
  extractClassNames,
  findClassTokenRange,
  rangeForSourceNode,
  resolveSelector,
} from "./scss-selector-utils";

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

/**
 * Parse a CSS Module file into a map of class name → SelectorInfo.
 *
 * Parsing is best-effort: a parse error produces an empty map, never
 * throws. The caller (StyleIndexCache) treats an empty map as a
 * legitimate "no classes found" result, so upstream providers keep
 * running even when one file is broken.
 */
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
    return classMap;
  }

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
      if (isGlobalBlockRule(node.selector)) continue;
      if (isLocalBlockRule(node.selector)) {
        walkStyleNodes(node.nodes, parentCtx, classMap);
        continue;
      }
      recordRule(node, parentCtx, classMap);
    } else if (node.type === "atrule" && isTransparentAtRule(node.name)) {
      if (node.name === "at-root" && isInlineAtRoot(node)) {
        recordAtRootInlineRule(node, classMap);
      } else if (node.name === "at-root") {
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
  return atrule.params.trim().length > 0;
}

function recordRule(
  rule: Rule,
  parentCtx: ParentContext,
  classMap: Map<string, SelectorInfo>,
): void {
  const { declarations, composes } = collectDeclarationsAndComposes(rule.nodes);
  const ruleRange = rangeForSourceNode(rule);

  const selectorSource = rule.raws.selector?.raw ?? rule.selector;
  const groups = enumerateGroups(selectorSource);
  const resolvedSelectors: string[] = [];

  for (const { raw, offset } of groups) {
    const resolved = resolveSelector(raw, parentCtx.selector);
    resolvedSelectors.push(resolved);
    const bemSuffix = classifyBemSuffixSite(rule, raw, offset, parentCtx, groups.length);
    const isNested = raw.includes("&");

    for (const className of extractClassNames(resolved)) {
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

  const parents = resolvedSelectors.length > 0 ? resolvedSelectors : [parentCtx.selector];
  for (const nextResolved of parents) {
    walkStyleNodes(rule.nodes, buildChildContext(resolvedSelectors, nextResolved), classMap);
  }
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
  const classNames = trimmed.split(/\s+/).filter((s) => s.length > 0);
  return classNames.length > 0 ? { classNames } : null;
}

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
