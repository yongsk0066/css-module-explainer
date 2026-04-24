import type { Range } from "@css-module-explainer/shared";
import type {
  SassSymbolDeclHIR,
  StyleDocumentHIR,
} from "../../engine-core-ts/src/core/hir/style-types";
import { rangeContains } from "../../engine-core-ts/src/core/util/range-utils";

export interface StyleCompletionItem {
  readonly label: string;
  readonly detail: string;
  readonly insertText: string;
  readonly filterText: string;
  readonly replacementRange: Range;
  readonly symbolKind: SassSymbolDeclHIR["symbolKind"];
}

type StyleCompletionContext =
  | {
      readonly symbolKind: "variable";
      readonly prefix: string;
      readonly replacementStartCharacter: number;
    }
  | {
      readonly symbolKind: "mixin" | "function";
      readonly prefix: string;
      readonly replacementStartCharacter: number;
    };

interface SassSymbolCompletionDecl {
  readonly symbolKind: SassSymbolDeclHIR["symbolKind"];
  readonly name: string;
  readonly range: Range;
  readonly ruleRange: Range;
}

export function resolveStyleCompletionItems(args: {
  readonly content: string;
  readonly line: number;
  readonly character: number;
  readonly styleDocument: StyleDocumentHIR;
}): readonly StyleCompletionItem[] {
  const lineText = readLine(args.content, args.line);
  const linePrefix = lineText.slice(0, args.character);
  const context = readStyleCompletionContext(linePrefix);
  if (!context) return [];

  const replacementRange: Range = {
    start: { line: args.line, character: context.replacementStartCharacter },
    end: { line: args.line, character: args.character },
  };
  const candidates = collectSassSymbolCompletionDecls(
    readSassSymbolCompletionDecls(args.styleDocument, args.content),
    context.symbolKind,
    args.line,
    args.character,
  );
  return candidates
    .filter((decl) => completionFilterText(decl).startsWith(context.prefix))
    .map((decl) => toStyleCompletionItem(decl, replacementRange))
    .toSorted((a, b) => a.filterText.localeCompare(b.filterText));
}

function readStyleCompletionContext(linePrefix: string): StyleCompletionContext | null {
  const variable = /(\$[A-Za-z0-9_-]*)$/u.exec(linePrefix);
  if (variable) {
    return {
      symbolKind: "variable",
      prefix: variable[1]!.slice(1),
      replacementStartCharacter: linePrefix.length - variable[1]!.length,
    };
  }

  const include = /@include\s+([A-Za-z_-][A-Za-z0-9_-]*)?$/u.exec(linePrefix);
  if (include) {
    const prefix = include[1] ?? "";
    return {
      symbolKind: "mixin",
      prefix,
      replacementStartCharacter: linePrefix.length - prefix.length,
    };
  }

  const functionName = /([A-Za-z_-][A-Za-z0-9_-]*)$/u.exec(linePrefix);
  if (!functionName || !isSassFunctionValueContext(linePrefix)) return null;
  return {
    symbolKind: "function",
    prefix: functionName[1]!,
    replacementStartCharacter: linePrefix.length - functionName[1]!.length,
  };
}

function isSassFunctionValueContext(linePrefix: string): boolean {
  const lastColon = linePrefix.lastIndexOf(":");
  const lastSemicolon = linePrefix.lastIndexOf(";");
  if (lastColon > lastSemicolon) return true;
  return /@return\s+[\w-]*$/u.test(linePrefix);
}

function collectSassSymbolCompletionDecls(
  decls: readonly SassSymbolCompletionDecl[],
  symbolKind: SassSymbolDeclHIR["symbolKind"],
  line: number,
  character: number,
): readonly SassSymbolCompletionDecl[] {
  const seen = new Set<string>();
  const results: SassSymbolCompletionDecl[] = [];
  for (const decl of decls) {
    if (decl.symbolKind !== symbolKind) continue;
    if (decl.symbolKind === "variable" && !isVariableDeclVisible(decl, line, character)) continue;
    if (seen.has(decl.name)) continue;
    seen.add(decl.name);
    results.push(decl);
  }
  return results;
}

function readSassSymbolCompletionDecls(
  styleDocument: StyleDocumentHIR,
  content: string,
): readonly SassSymbolCompletionDecl[] {
  if (styleDocument.sassSymbolDecls.length > 0) return styleDocument.sassSymbolDecls;
  return collectFallbackSassSymbolCompletionDecls(content);
}

function collectFallbackSassSymbolCompletionDecls(
  content: string,
): readonly SassSymbolCompletionDecl[] {
  const decls: SassSymbolCompletionDecl[] = [];
  const lines = content.split(/\r?\n/u);
  for (const [line, text] of lines.entries()) {
    const variable = /^(\s*)\$([A-Za-z_-][A-Za-z0-9_-]*)\s*:/u.exec(text);
    if (variable) {
      decls.push(makeFallbackDecl("variable", variable[2]!, line, variable[1]!.length));
      continue;
    }

    const callable = /^(\s*)@(mixin|function)\s+([A-Za-z_-][A-Za-z0-9_-]*)/u.exec(text);
    if (!callable) continue;
    const symbolKind = callable[2] === "mixin" ? "mixin" : "function";
    const character = callable[1]!.length + `@${callable[2]} `.length;
    decls.push(makeFallbackDecl(symbolKind, callable[3]!, line, character));
  }
  return decls;
}

function makeFallbackDecl(
  symbolKind: SassSymbolDeclHIR["symbolKind"],
  name: string,
  line: number,
  character: number,
): SassSymbolCompletionDecl {
  const range = {
    start: { line, character },
    end: {
      line,
      character: character + (symbolKind === "variable" ? name.length + 1 : name.length),
    },
  };
  return { symbolKind, name, range, ruleRange: range };
}

function isVariableDeclVisible(
  decl: SassSymbolCompletionDecl,
  line: number,
  character: number,
): boolean {
  if (startsAtSamePosition(decl.range, decl.ruleRange)) return true;
  return rangeContains(decl.ruleRange, line, character);
}

function startsAtSamePosition(a: Range, b: Range): boolean {
  return a.start.line === b.start.line && a.start.character === b.start.character;
}

function toStyleCompletionItem(
  decl: SassSymbolCompletionDecl,
  replacementRange: Range,
): StyleCompletionItem {
  return {
    label: completionLabel(decl),
    detail: completionDetail(decl),
    insertText: completionInsertText(decl),
    filterText: completionFilterText(decl),
    replacementRange,
    symbolKind: decl.symbolKind,
  };
}

function completionLabel(decl: SassSymbolCompletionDecl): string {
  return decl.symbolKind === "variable" ? `$${decl.name}` : decl.name;
}

function completionInsertText(decl: SassSymbolCompletionDecl): string {
  return completionLabel(decl);
}

function completionFilterText(decl: SassSymbolCompletionDecl): string {
  return decl.name;
}

function completionDetail(decl: SassSymbolCompletionDecl): string {
  switch (decl.symbolKind) {
    case "variable":
      return "Sass variable";
    case "mixin":
      return "Sass mixin";
    case "function":
      return "Sass function";
  }
}

function readLine(content: string, line: number): string {
  return content.split(/\r?\n/u)[line] ?? "";
}
