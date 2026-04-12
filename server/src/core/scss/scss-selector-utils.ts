import type { Range } from "@css-module-explainer/shared";
import type { AtRule, Rule } from "postcss";

/**
 * Split a selector source on top-level commas, tracking the offset
 * of each group within the original string. Unlike `rule.selectors`
 * (which loses per-group offsets), this walker respects paren depth
 * so commas inside `:is(.a, .b)` or `:not(.c, .d)` are preserved.
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
 * Resolve a raw selector against its parent selector the way SCSS
 * does:
 *   parent ".button", raw "&--primary" → ".button--primary"
 *   parent ".card",   raw ".inner"      → ".card .inner"
 *   parent "",        raw ".top"        → ".top"
 */
export function resolveSelector(raw: string, parent: string): string {
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
export function extractClassNames(resolvedSelector: string): string[] {
  const withoutGlobal = resolvedSelector.replace(/:global\s*\(\s*[^)]*\)/g, "");
  const withoutLocal = withoutGlobal.replace(/:local\s*\(\s*([^)]*)\s*\)/g, "$1");
  const withoutPseudos = withoutLocal.replace(/::?[a-zA-Z-]+(?:\([^)]*\))?/g, "");

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

export function findClassTokenRange(
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

export function atRootTokenRange(
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

export function rangeForSourceNode(node: Rule | AtRule): Range {
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
