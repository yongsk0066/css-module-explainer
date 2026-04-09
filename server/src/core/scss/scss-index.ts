import * as crypto from "node:crypto";
import type { Range, SelectorInfo, ScssClassMap } from "@css-module-explainer/shared";
import postcss, {
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
    const processOptions = syntax ? { from: filePath, syntax } : { from: filePath };
    root = postcss().process(content, processOptions).root;
  } catch {
    return classMap;
  }

  // postcss's root.nodes is typed as ChildNode[] | Root_[] at the
  // Document level, but at Root level it is ChildNode[]. Narrow
  // by walking children directly.
  walkRules(root.nodes as ChildNode[], "", classMap);
  return classMap;
}

/**
 * Walk postcss child nodes and record every class that CSS Modules
 * would expose on the `styles` object.
 *
 * - `parentSelector` carries the resolved selector chain for SCSS
 *   `&` nesting. Empty at the top level.
 * - `@media` / `@at-root` / `@supports` are transparent wrappers:
 *   we recurse into their bodies with the current parent intact.
 * - `@keyframes`, `@font-face`, and any other at-rule are NOT
 *   transparent — their children are not class selectors in the
 *   CSS-Modules sense.
 */
function walkRules(
  nodes: ChildNode[] | undefined,
  parentSelector: string,
  classMap: Map<string, SelectorInfo>,
): void {
  if (!nodes) return;
  for (const node of nodes) {
    if (node.type === "rule") {
      recordRule(node, parentSelector, classMap);
    } else if (node.type === "atrule" && isTransparentAtRule(node.name)) {
      // Inline @at-root form — `@at-root .escaped { ... }` — parses as
      // an atrule with its selector in `params` and declarations as
      // direct children. Treat it as a synthetic rule anchored at the
      // workspace root (empty parent), since that's what @at-root
      // semantically does.
      if (node.name === "at-root" && hasInlineSelector(node)) {
        recordAtRootInlineRule(node, classMap);
      } else {
        walkRules(node.nodes, parentSelector, classMap);
      }
    }
  }
}

function isTransparentAtRule(name: string): boolean {
  return name === "media" || name === "at-root" || name === "supports";
}

function hasInlineSelector(atrule: AtRule): boolean {
  const params = atrule.params?.trim();
  if (!params) return false;
  // Inline form carries a selector in `params`. The block form
  // (`@at-root { ... }`) has an empty `params`.
  return params.length > 0;
}

function recordRule(rule: Rule, parentSelector: string, classMap: Map<string, SelectorInfo>): void {
  const declarations = collectOwnDeclarations(rule);
  const ruleRange = rangeForRule(rule);

  // Each comma-separated selector produces its own entry.
  const selectors = rule.selectors ?? [rule.selector];
  const resolvedSelectors: string[] = [];

  for (const raw of selectors) {
    const resolved = resolveSelector(raw, parentSelector);
    resolvedSelectors.push(resolved);

    for (const className of extractClassNames(resolved)) {
      const tokenRange = findTokenRange(rule, className, raw);
      // Q6 B #8 — cascade last-wins: .set() overwrites.
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
  // the new parent. SCSS semantics: a grouped nested rule under
  // ".a, .b" uses ".a" as its & resolution.
  const nextParent = resolvedSelectors[0] ?? parentSelector;
  walkRules(rule.nodes, nextParent, classMap);
}

function collectOwnDeclarations(rule: Rule): string {
  // Only declarations that belong directly to this rule — not
  // nested rules. CSS variables (--name) are included so hover
  // cards can show them.
  const parts: string[] = [];
  for (const child of rule.nodes ?? []) {
    if (child.type === "decl") {
      const d = child as Declaration;
      parts.push(`${d.prop}: ${d.value}`);
    }
  }
  return parts.join("; ");
}

/**
 * Record a class map entry for the inline `@at-root <selector> { ... }`
 * form. The at-root atrule carries the selector in `params` and its
 * declarations as direct children. Because @at-root escapes all
 * enclosing nesting, the parent selector is intentionally dropped.
 */
function recordAtRootInlineRule(atrule: AtRule, classMap: Map<string, SelectorInfo>): void {
  const selector = atrule.params.trim();
  const declarations = collectAtRuleDeclarations(atrule);
  const ruleRange = rangeForAtRule(atrule);
  const selectors = selector.split(",").map((s) => s.trim());

  for (const raw of selectors) {
    for (const className of extractClassNames(raw)) {
      classMap.set(className, {
        name: className,
        range: findAtRuleTokenRange(atrule, className, raw),
        fullSelector: raw,
        declarations,
        ruleRange,
      });
    }
  }
}

function collectAtRuleDeclarations(atrule: AtRule): string {
  const parts: string[] = [];
  for (const child of atrule.nodes ?? []) {
    if (child.type === "decl") {
      const d = child as Declaration;
      parts.push(`${d.prop}: ${d.value}`);
    }
  }
  return parts.join("; ");
}

function rangeForAtRule(atrule: AtRule): Range {
  const start = atrule.source?.start;
  const end = atrule.source?.end;
  return {
    start: start
      ? { line: start.line - 1, character: start.column - 1 }
      : { line: 0, character: 0 },
    end: end ? { line: end.line - 1, character: end.column - 1 } : { line: 0, character: 0 },
  };
}

function findAtRuleTokenRange(atrule: AtRule, className: string, rawSelector: string): Range {
  const start = atrule.source?.start;
  if (!start) return zeroRange();
  // Inline @at-root: the params start at `atrule.source.start.column`
  // plus "@at-root " (9 characters). This is best-effort since postcss
  // does not expose the params column directly.
  const line = start.line - 1;
  const baseCol = start.column - 1 + "@at-root ".length;
  const offset = rawSelector.indexOf(`.${className}`);
  const character = offset >= 0 ? baseCol + offset + 1 : baseCol;
  return {
    start: { line, character },
    end: { line, character: character + className.length },
  };
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
 * Rules:
 *   - `:global(.x)` wraps are stripped and the inner class is NOT
 *     recorded (it does not appear on the styles object).
 *   - `:local(.x)` wraps are stripped and the inner class IS
 *     recorded.
 *   - Other pseudo-classes/elements (:hover, ::before) are stripped
 *     from the name but don't change inclusion.
 *   - Only the LAST class in a compound/descendant selector is
 *     exposed on `styles` — that's the name the user imports.
 *     Each class in a group selector (".a, .b") is a separate
 *     call to this function, so grouping is handled upstream.
 */
function extractClassNames(resolvedSelector: string): string[] {
  // Drop :global(...) blocks entirely — including their class names.
  const withoutGlobal = resolvedSelector.replace(/:global\s*\(\s*[^)]*\)/g, "");
  // Strip :local(...) wrappers but keep the inner class.
  const withoutLocal = withoutGlobal.replace(/:local\s*\(\s*([^)]*)\s*\)/g, "$1");
  // Remove pseudo-classes/elements that aren't wrappers.
  const withoutPseudos = withoutLocal.replace(/::?[a-zA-Z-]+(?:\([^)]*\))?/g, "");
  const matches = withoutPseudos.match(/\.[a-zA-Z_][\w-]*/g) ?? [];
  if (matches.length === 0) return [];
  const last = matches[matches.length - 1]!;
  return [last.slice(1)];
}

function findTokenRange(rule: Rule, className: string, rawSelector: string): Range {
  const start = rule.source?.start;
  if (!start) return zeroRange();
  const line = start.line - 1;
  const dotted = `.${className}`;
  // Search the raw (unresolved) selector so the character offset
  // matches the text the user wrote on disk.
  const offset = rawSelector.indexOf(dotted);
  const baseCol = start.column - 1;
  const character = offset >= 0 ? baseCol + offset + 1 : baseCol;
  return {
    start: { line, character },
    end: { line, character: character + className.length },
  };
}

function rangeForRule(rule: Rule): Range {
  const start = rule.source?.start;
  const end = rule.source?.end;
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

// ──────────────────────────────────────────────────────────────
// StyleIndexCache
// ──────────────────────────────────────────────────────────────

interface StyleIndexCacheEntry {
  hash: string;
  classMap: ScssClassMap;
}

/**
 * Content-hashed LRU cache for parseStyleModule results.
 *
 * - Hit path: provider asks for a file + its current content, we
 *   compute md5 once and return the cached ScssClassMap by
 *   reference identity.
 * - Miss path: we call parseStyleModule, store the result, and
 *   return it.
 * - Eviction: insertion order + size bound; a hit moves the entry
 *   to the end so active files stay warm.
 */
export class StyleIndexCache {
  private readonly entries = new Map<string, StyleIndexCacheEntry>();
  private readonly max: number;

  constructor(options: { max: number }) {
    this.max = options.max;
  }

  get(filePath: string, content: string): ScssClassMap {
    const hash = md5(content);
    const cached = this.entries.get(filePath);
    if (cached && cached.hash === hash) {
      // Touch: re-insert to move to the end (MRU).
      this.entries.delete(filePath);
      this.entries.set(filePath, cached);
      return cached.classMap;
    }

    const classMap = parseStyleModule(content, filePath);
    this.put(filePath, { hash, classMap });
    return classMap;
  }

  invalidate(filePath: string): void {
    this.entries.delete(filePath);
  }

  clear(): void {
    this.entries.clear();
  }

  private put(filePath: string, entry: StyleIndexCacheEntry): void {
    if (this.entries.has(filePath)) {
      this.entries.delete(filePath);
    } else if (this.entries.size >= this.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }
    this.entries.set(filePath, entry);
  }
}

function md5(content: string): string {
  return crypto.createHash("md5").update(content).digest("hex");
}
