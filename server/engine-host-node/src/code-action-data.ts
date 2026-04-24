import type { Range } from "@css-module-explainer/shared";
import type {
  SassSymbolKind,
  StyleDocumentHIR,
} from "../../engine-core-ts/src/core/hir/style-types";
import { pathToFileUrl } from "../../engine-core-ts/src/core/util/text-utils";

export interface RecoveryEditActionData {
  readonly uri: string;
  readonly range: Range;
  readonly newText: string;
}

export function buildCreateSelectorActionData(
  className: string,
  scssModulePath: string,
  styleDocument: StyleDocumentHIR,
): RecoveryEditActionData {
  const insertionRange = findSelectorInsertionRange(styleDocument);
  return {
    uri: pathToFileUrl(scssModulePath),
    range: insertionRange,
    newText:
      styleDocument.selectors.length > 0 ? `\n\n.${className} {\n}\n` : `.${className} {\n}\n`,
  };
}

export function buildCreateValueActionData(
  valueName: string,
  scssModulePath: string,
  styleDocument: StyleDocumentHIR,
): RecoveryEditActionData {
  const insertionRange = findValueInsertionRange(styleDocument);
  return {
    uri: pathToFileUrl(scssModulePath),
    range: insertionRange,
    newText:
      styleDocument.valueDecls.length > 0 || styleDocument.valueImports.length > 0
        ? `\n@value ${valueName}: ;`
        : `@value ${valueName}: ;\n`,
  };
}

export function buildCreateKeyframesActionData(
  keyframesName: string,
  scssModulePath: string,
  styleDocument: StyleDocumentHIR,
): RecoveryEditActionData {
  const insertionRange = findKeyframesInsertionRange(styleDocument);
  const hasExistingContent =
    styleDocument.keyframes.length > 0 ||
    styleDocument.valueDecls.length > 0 ||
    styleDocument.valueImports.length > 0 ||
    styleDocument.selectors.length > 0;
  const insertsAtTop =
    insertionRange.start.line === 0 &&
    insertionRange.start.character === 0 &&
    insertionRange.end.line === 0 &&
    insertionRange.end.character === 0 &&
    styleDocument.keyframes.length === 0 &&
    styleDocument.valueDecls.length === 0 &&
    styleDocument.valueImports.length === 0;

  return {
    uri: pathToFileUrl(scssModulePath),
    range: insertionRange,
    newText: insertsAtTop
      ? hasExistingContent
        ? `@keyframes ${keyframesName} {\n}\n\n`
        : `@keyframes ${keyframesName} {\n}\n`
      : `\n\n@keyframes ${keyframesName} {\n}\n`,
  };
}

export function buildCreateSassSymbolActionData(
  symbolKind: SassSymbolKind,
  symbolName: string,
  scssModulePath: string,
  styleDocument: StyleDocumentHIR,
): RecoveryEditActionData {
  const insertionRange = findSassSymbolInsertionRange(styleDocument);
  const stub = sassSymbolStub(symbolKind, symbolName);
  const insertsAtTop =
    insertionRange.start.line === 0 &&
    insertionRange.start.character === 0 &&
    insertionRange.end.line === 0 &&
    insertionRange.end.character === 0;
  const hasExistingContent =
    styleDocument.valueDecls.length > 0 ||
    styleDocument.valueImports.length > 0 ||
    styleDocument.keyframes.length > 0 ||
    styleDocument.selectors.length > 0;

  return {
    uri: pathToFileUrl(scssModulePath),
    range: insertionRange,
    newText: insertsAtTop ? (hasExistingContent ? `${stub}\n\n` : `${stub}\n`) : `\n\n${stub}`,
  };
}

function findSelectorInsertionRange(styleDocument: StyleDocumentHIR): Range {
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

function findValueInsertionRange(styleDocument: StyleDocumentHIR): Range {
  const valueFacts = [...styleDocument.valueDecls, ...styleDocument.valueImports];
  if (valueFacts.length === 0) {
    return {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    };
  }

  let latest = valueFacts[0]!.ruleRange.end;
  for (const valueFact of valueFacts) {
    const end = valueFact.ruleRange.end;
    if (end.line > latest.line || (end.line === latest.line && end.character > latest.character)) {
      latest = end;
    }
  }

  return {
    start: { line: latest.line, character: latest.character },
    end: { line: latest.line, character: latest.character },
  };
}

function findSassSymbolInsertionRange(styleDocument: StyleDocumentHIR): Range {
  const valueFacts = [...styleDocument.valueDecls, ...styleDocument.valueImports];
  if (valueFacts.length === 0) {
    return {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    };
  }

  let latest = valueFacts[0]!.ruleRange.end;
  for (const valueFact of valueFacts) {
    const end = valueFact.ruleRange.end;
    if (end.line > latest.line || (end.line === latest.line && end.character > latest.character)) {
      latest = end;
    }
  }

  return {
    start: { line: latest.line, character: latest.character },
    end: { line: latest.line, character: latest.character },
  };
}

function sassSymbolStub(symbolKind: SassSymbolKind, symbolName: string): string {
  switch (symbolKind) {
    case "variable":
      return `$${symbolName}: ;`;
    case "mixin":
      return `@mixin ${symbolName}() {\n}`;
    case "function":
      return `@function ${symbolName}() {\n  @return null;\n}`;
  }
}

function findKeyframesInsertionRange(styleDocument: StyleDocumentHIR): Range {
  if (styleDocument.keyframes.length > 0) {
    let latest = styleDocument.keyframes[0]!.ruleRange.end;
    for (const keyframes of styleDocument.keyframes) {
      const end = keyframes.ruleRange.end;
      if (
        end.line > latest.line ||
        (end.line === latest.line && end.character > latest.character)
      ) {
        latest = end;
      }
    }
    return {
      start: { line: latest.line, character: latest.character },
      end: { line: latest.line, character: latest.character },
    };
  }

  const valueFacts = [...styleDocument.valueDecls, ...styleDocument.valueImports];
  if (valueFacts.length > 0) {
    let latest = valueFacts[0]!.ruleRange.end;
    for (const valueFact of valueFacts) {
      const end = valueFact.ruleRange.end;
      if (
        end.line > latest.line ||
        (end.line === latest.line && end.character > latest.character)
      ) {
        latest = end;
      }
    }
    return {
      start: { line: latest.line, character: latest.character },
      end: { line: latest.line, character: latest.character },
    };
  }

  return {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 0 },
  };
}
