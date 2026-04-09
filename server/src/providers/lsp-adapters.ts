import type { Range as LspRange } from "vscode-languageserver/node";
import type { Range } from "@css-module-explainer/shared";

/**
 * Shallow-copy a shared `Range` into an LSP `Range`.
 *
 * Shared ranges carry `readonly` markers; LSP ranges do not. TS
 * variance rejects direct assignment even though the shapes match.
 * Single source of truth for every provider that returns LSP
 * Range-bearing types (LocationLink, Hover, Diagnostic).
 */
export function toLspRange(r: Range): LspRange {
  return {
    start: { line: r.start.line, character: r.start.character },
    end: { line: r.end.line, character: r.end.character },
  };
}
