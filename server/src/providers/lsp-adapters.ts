import type { Range as LspRange } from "vscode-languageserver/node";
import type { Range } from "@css-module-explainer/shared";

/** Convert shared.Range (readonly) to lsp.Range (mutable). */
export function toLspRange(r: Range): LspRange {
  return {
    start: { line: r.start.line, character: r.start.character },
    end: { line: r.end.line, character: r.end.character },
  };
}
