import * as nodeUrl from "node:url";

/**
 * Return the 0-indexed line at `lineNumber` from `content`,
 * excluding the trailing `\n` (and `\r` if present). Returns
 * `undefined` when the line is out of range.
 *
 * Implementation walks `indexOf('\n')` to avoid allocating a
 * full `split('\n')` array on every hover/definition call.
 */
export function getLineAt(content: string, lineNumber: number): string | undefined {
  if (lineNumber < 0) return undefined;

  let start = 0;
  let currentLine = 0;
  while (currentLine < lineNumber && start < content.length) {
    const nextNewline = content.indexOf("\n", start);
    if (nextNewline === -1) return undefined;
    start = nextNewline + 1;
    currentLine += 1;
  }
  if (start > content.length) return undefined;
  if (start === content.length && lineNumber > 0 && content.at(-1) !== "\n") {
    return undefined;
  }

  const end = content.indexOf("\n", start);
  const line = end === -1 ? content.slice(start) : content.slice(start, end);
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

/**
 * Levenshtein distance with optional early termination.
 *
 * When `maxDistance` is provided:
 *   - Strings whose length difference exceeds the bound are
 *     rejected in O(1).
 *   - After each DP row, the row minimum is checked; if it
 *     already exceeds the bound, computation aborts early.
 *
 * Returns `maxDistance + 1` when the distance exceeds the bound.
 */
export function levenshteinDistance(a: string, b: string, maxDistance?: number): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  if (maxDistance !== undefined && Math.abs(a.length - b.length) > maxDistance) {
    return maxDistance + 1;
  }

  const rows = a.length + 1;
  const cols = b.length + 1;
  const prev: number[] = Array.from({ length: cols });
  const curr: number[] = Array.from({ length: cols });

  for (let j = 0; j < cols; j += 1) prev[j] = j;

  for (let i = 1; i < rows; i += 1) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j < cols; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
      if (curr[j]! < rowMin) rowMin = curr[j]!;
    }
    if (maxDistance !== undefined && rowMin > maxDistance) {
      return maxDistance + 1;
    }
    for (let j = 0; j < cols; j += 1) prev[j] = curr[j]!;
  }

  return prev[cols - 1]!;
}

/**
 * Return the candidate with the smallest Levenshtein distance to
 * `target`, or null when none is within `maxDistance` (default 3).
 * Ties are broken by iteration order — first match wins.
 *
 * Passes `maxDistance` through to the bounded Levenshtein so each
 * comparison is O(n * maxDistance) instead of O(n²).
 */
export function findClosestMatch(
  target: string,
  candidates: Iterable<string>,
  maxDistance = 3,
): string | null {
  let best: string | null = null;
  let bestDistance = maxDistance + 1;
  for (const candidate of candidates) {
    const distance = levenshteinDistance(target, candidate, bestDistance - 1);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return bestDistance <= maxDistance ? best : null;
}

/**
 * Thin wrappers over node:url's URL ↔ filesystem path conversion.
 * Centralised so tests can stub them and providers never touch
 * the `file:` scheme string directly.
 */
export function pathToFileUrl(absolutePath: string): string {
  return nodeUrl.pathToFileURL(absolutePath).toString();
}

export function fileUrlToPath(fileUrl: string): string {
  return nodeUrl.fileURLToPath(fileUrl);
}
