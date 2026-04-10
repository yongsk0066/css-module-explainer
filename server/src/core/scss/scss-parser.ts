import type { Range, SelectorInfo, ScssClassMap } from "@css-module-explainer/shared";
import {
  parse as postcssParse,
  type Rule,
  type Declaration,
  type ChildNode,
  type AtRule,
  type Syntax,
} from "postcss";
import { findLangForPath } from "./lang-registry.js";

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
  // module stays runtime-free. This is the designed narrowing
  // boundary — it lives in exactly one place.
  const syntax = lang?.syntax as Syntax | undefined;

  let root;
  try {
    // `syntax` must only be present when non-undefined under
    // exactOptionalPropertyTypes; build the options object
    // conditionally so we do not pass `syntax: undefined`.
    const parseOptions = syntax ? { from: filePath, syntax } : { from: filePath };
    root = postcssParse(content, parseOptions);
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
  walkStyleNodes(root.nodes as ChildNode[], "", classMap);
  return classMap;
}

/**
 * Walk postcss child nodes — both rules and transparent at-rules —
 * and record every class that CSS Modules would expose on the
 * `styles` object.
 *
 * - `parentSelector` carries the resolved selector chain for SCSS
 *   `&` nesting. Empty at the top level.
 * - `@media` / `@at-root` (block form) / `@supports` are transparent
 *   wrappers: we recurse into their bodies with the current parent
 *   intact.
 * - `@at-root <selector>` inline form is special-cased (see branch
 *   below) because postcss-scss puts its selector in `params` and
 *   declarations as direct children.
 * - `@keyframes`, `@font-face`, and any other at-rule are NOT
 *   transparent — their children are not class selectors in the
 *   CSS-Modules sense.
 */
function walkStyleNodes(
  nodes: ChildNode[] | undefined,
  parentSelector: string,
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
        walkStyleNodes(node.nodes, parentSelector, classMap);
        continue;
      }
      recordRule(node, parentSelector, classMap);
    } else if (node.type === "atrule" && isTransparentAtRule(node.name)) {
      if (node.name === "at-root" && isInlineAtRoot(node)) {
        recordAtRootInlineRule(node, classMap);
      } else if (node.name === "at-root") {
        // Block form `@at-root { .escaped {} }` — resets the
        // parent selector so nested rules escape all enclosing
        // nesting, which is the entire point of @at-root.
        walkStyleNodes(node.nodes, "", classMap);
      } else {
        walkStyleNodes(node.nodes, parentSelector, classMap);
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

function recordRule(rule: Rule, parentSelector: string, classMap: Map<string, SelectorInfo>): void {
  const declarations = collectDeclarations(rule.nodes);
  const ruleRange = rangeForSourceNode(rule);

  // Each comma-separated selector produces its own entry.
  const selectors = rule.selectors ?? [rule.selector];
  const resolvedSelectors: string[] = [];

  for (const raw of selectors) {
    const resolved = resolveSelector(raw, parentSelector);
    resolvedSelectors.push(resolved);

    for (const className of extractClassNames(resolved)) {
      const tokenRange = findClassTokenRange(rule.source?.start, className, raw);
      // Cascade last-wins: .set() overwrites on redefinition.
      classMap.set(className, {
        name: className,
        range: tokenRange,
        fullSelector: resolved,
        declarations,
        ruleRange,
      });
    }
  }

  // Recurse into nested rules using the first resolved selector as
  // the new parent. Known limitation: SCSS actually expands nested
  // rules under ALL grouped selectors (".a, .b" → ".a .child, .b .child");
  // we only track the first branch here. No real-world project has
  // hit this yet, but the day it does, this comment is the breadcrumb.
  const nextParent = resolvedSelectors[0] ?? parentSelector;
  walkStyleNodes(rule.nodes, nextParent, classMap);
}

/**
 * Collect direct-child declarations of a rule or at-rule as a
 * flattened `"prop: value; ..."` string. Does not descend into
 * nested rules. CSS variables (--name) are included so hover cards
 * can show them.
 */
function collectDeclarations(nodes: ChildNode[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .filter((node): node is Declaration => node.type === "decl")
    .map((decl) => `${decl.prop}: ${decl.value}`)
    .join("; ");
}

/**
 * Record a class map entry for the inline `@at-root <selector> { ... }`
 * form. The at-root atrule carries the selector in `params` and its
 * declarations as direct children. Because @at-root escapes all
 * enclosing nesting, the parent selector is intentionally dropped.
 */
function recordAtRootInlineRule(atrule: AtRule, classMap: Map<string, SelectorInfo>): void {
  const selector = atrule.params.trim();
  const declarations = collectDeclarations(atrule.nodes);
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
 * Extract class names that CSS Modules would expose on the styles
 * object for a resolved selector.
 *
 * Rules applied in order:
 *   1. `:global(.x)` wraps are stripped **and** their inner class
 *      is dropped — :global classes never appear on the styles
 *      object.
 *   2. `:local(.x)` wraps are stripped but the inner class stays.
 *   3. Other pseudo-classes/elements (:hover, ::before, :nth-child)
 *      are stripped so they do not interfere with class matching.
 *   4. What remains is a descendant selector like `.a .b .c.d`;
 *      CSS Modules exposes every class in the **rightmost
 *      compound segment** (`.c.d` → both `c` and `d`). The earlier
 *      segments exist as ancestors but are not keys.
 *
 * This returns every class from that rightmost compound, so
 * `.a .b.c` yields `["b", "c"]` and `.btn` yields `["btn"]`.
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
  const matches = lastSegment.match(/\.[a-zA-Z_][\w-]*/g) ?? [];
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
