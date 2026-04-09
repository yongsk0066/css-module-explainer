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
 * Classic dynamic-programming Levenshtein distance.
 * Used only for "Did you mean?" suggestions where inputs are
 * short class names; O(n*m) is fine.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const prev: number[] = Array.from({ length: cols });
  const curr: number[] = Array.from({ length: cols });

  for (let j = 0; j < cols; j += 1) prev[j] = j;

  for (let i = 1; i < rows; i += 1) {
    curr[0] = i;
    for (let j = 1; j < cols; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1]! + 1, // insertion
        prev[j]! + 1, // deletion
        prev[j - 1]! + cost, // substitution
      );
    }
    for (let j = 0; j < cols; j += 1) prev[j] = curr[j]!;
  }

  return prev[cols - 1]!;
}

/**
 * Return the candidate with the smallest Levenshtein distance to
 * `target`, or null when none is within `maxDistance` (default 3).
 * Ties are broken by iteration order — first match wins.
 */
export function findClosestMatch(
  target: string,
  candidates: Iterable<string>,
  maxDistance = 3,
): string | null {
  let best: string | null = null;
  let bestDistance = maxDistance + 1;
  for (const candidate of candidates) {
    const distance = levenshteinDistance(target, candidate);
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
