import type { Range as LspRange } from "vscode-languageserver/node";
import { pathToFileUrl } from "../core/util/text-utils";
import type { StyleDocumentHIR } from "../core/hir/style-types";

export function buildCreateSelectorActionData(
  className: string,
  scssModulePath: string,
  styleDocument: StyleDocumentHIR,
): {
  readonly uri: string;
  readonly range: LspRange;
  readonly newText: string;
} {
  const insertionRange = findSelectorInsertionRange(styleDocument);
  return {
    uri: pathToFileUrl(scssModulePath),
    range: insertionRange,
    newText:
      styleDocument.selectors.length > 0 ? `\n\n.${className} {\n}\n` : `.${className} {\n}\n`,
  };
}

function findSelectorInsertionRange(styleDocument: StyleDocumentHIR): LspRange {
  if (styleDocument.selectors.length === 0) {
    return {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    };
  }

  let latest = styleDocument.selectors[0]!.ruleRange.end;
  for (const selector of styleDocument.selectors) {
    const end = selector.ruleRange.end;
    if (end.line > latest.line || (end.line === latest.line && end.character > latest.character)) {
      latest = end;
    }
  }

  return {
    start: { line: latest.line, character: latest.character },
    end: { line: latest.line, character: latest.character },
  };
}
