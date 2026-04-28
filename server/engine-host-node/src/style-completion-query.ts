import type { Range } from "@css-module-explainer/shared";
import type {
  CustomPropertyDeclHIR,
  SassSymbolDeclHIR,
  StylePreprocessorSymbolSyntax,
  StyleDocumentHIR,
} from "../../engine-core-ts/src/core/hir/style-types";
import type { StyleDependencyGraph } from "../../engine-core-ts/src/core/semantic";
import {
  listCustomPropertyModuleUseDeclTargets,
  listSassModuleExportedSymbols,
  resolveSassModuleUseTarget,
  type SassModulePathAliasResolver,
  type SassModuleResolutionOptions,
} from "../../engine-core-ts/src/core/query";
import { rangeContains } from "../../engine-core-ts/src/core/util/range-utils";

export interface StyleCompletionItem {
  readonly label: string;
  readonly detail: string;
  readonly insertText: string;
  readonly filterText: string;
  readonly replacementRange: Range;
  readonly symbolSyntax?: StylePreprocessorSymbolSyntax;
  readonly symbolKind: SassSymbolDeclHIR["symbolKind"] | "customProperty";
}

type StyleCompletionContext =
  | {
      readonly symbolKind: "customProperty";
      readonly prefix: string;
      readonly replacementStartCharacter: number;
    }
  | {
      readonly symbolKind: "variable";
      readonly symbolSyntax?: StylePreprocessorSymbolSyntax;
      readonly prefix: string;
      readonly replacementStartCharacter: number;
    }
  | {
      readonly symbolKind: "mixin" | "function";
      readonly symbolSyntax?: undefined;
      readonly prefix: string;
      readonly replacementStartCharacter: number;
    };

interface SassSymbolCompletionDecl {
  readonly syntax?: StylePreprocessorSymbolSyntax;
  readonly symbolKind: SassSymbolDeclHIR["symbolKind"];
  readonly name: string;
  readonly range: Range;
  readonly ruleRange: Range;
}

interface CustomPropertyCompletionDecl extends Pick<
  CustomPropertyDeclHIR,
  "name" | "range" | "ruleRange"
> {
  readonly symbolKind: "customProperty";
}

export function resolveStyleCompletionItems(args: {
  readonly content: string;
  readonly line: number;
  readonly character: number;
  readonly styleDocument: StyleDocumentHIR;
  readonly styleDocumentForPath?: (filePath: string) => StyleDocumentHIR | null;
  readonly aliasResolver?: SassModulePathAliasResolver;
  readonly styleDependencyGraph?: StyleDependencyGraph;
  readonly readFile?: (filePath: string) => string | null;
}): readonly StyleCompletionItem[] {
  const lineText = readLine(args.content, args.line);
  const linePrefix = lineText.slice(0, args.character);
  const context = readStyleCompletionContext(linePrefix);
  if (!context) return [];

  const replacementRange: Range = {
    start: { line: args.line, character: context.replacementStartCharacter },
    end: { line: args.line, character: args.character },
  };
  if (context.symbolKind === "customProperty") {
    return collectCustomPropertyCompletionDecls(args)
      .filter((decl) => decl.name.startsWith(context.prefix))
      .map((decl) => toCustomPropertyCompletionItem(decl, replacementRange))
      .toSorted((a, b) => a.filterText.localeCompare(b.filterText));
  }

  const candidates = collectSassSymbolCompletionDecls(
    readSassSymbolCompletionDecls(args),
    context.symbolKind,
    context.symbolSyntax,
    args.line,
    args.character,
  );
  return candidates
    .filter((decl) => completionFilterText(decl).startsWith(context.prefix))
    .map((decl) => toStyleCompletionItem(decl, replacementRange))
    .toSorted((a, b) => a.filterText.localeCompare(b.filterText));
}

function readStyleCompletionContext(linePrefix: string): StyleCompletionContext | null {
  const customProperty = /var\(\s*(--[\p{L}\p{N}\p{M}_-]*)?$/u.exec(linePrefix);
  if (customProperty) {
    const prefix = customProperty[1] ?? "";
    return {
      symbolKind: "customProperty",
      prefix,
      replacementStartCharacter: linePrefix.length - prefix.length,
    };
  }

  const variable = /(\$[A-Za-z0-9_-]*)$/u.exec(linePrefix);
  if (variable) {
    return {
      symbolKind: "variable",
      symbolSyntax: "sass",
      prefix: variable[1]!.slice(1),
      replacementStartCharacter: linePrefix.length - variable[1]!.length,
    };
  }

  const lessVariable = /(@[A-Za-z0-9_-]*)$/u.exec(linePrefix);
  if (lessVariable && isSassFunctionValueContext(linePrefix)) {
    return {
      symbolKind: "variable",
      symbolSyntax: "less",
      prefix: lessVariable[1]!.slice(1),
      replacementStartCharacter: linePrefix.length - lessVariable[1]!.length,
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
  symbolSyntax: StylePreprocessorSymbolSyntax | undefined,
  line: number,
  character: number,
): readonly SassSymbolCompletionDecl[] {
  const seen = new Set<string>();
  const results: SassSymbolCompletionDecl[] = [];
  for (const decl of decls) {
    if (decl.symbolKind !== symbolKind) continue;
    if ((decl.syntax ?? "sass") !== (symbolSyntax ?? "sass")) continue;
    if (decl.symbolKind === "variable" && !isVariableDeclVisible(decl, line, character)) continue;
    if (seen.has(decl.name)) continue;
    seen.add(decl.name);
    results.push(decl);
  }
  return results;
}

function collectCustomPropertyCompletionDecls(args: {
  readonly styleDocument: StyleDocumentHIR;
  readonly styleDependencyGraph?: StyleDependencyGraph;
  readonly styleDocumentForPath?: (filePath: string) => StyleDocumentHIR | null;
  readonly aliasResolver?: SassModulePathAliasResolver;
  readonly readFile?: (filePath: string) => string | null;
}): readonly CustomPropertyCompletionDecl[] {
  const seen = new Set<string>();
  const decls: CustomPropertyCompletionDecl[] = [];
  const pushDecl = (decl: Pick<CustomPropertyDeclHIR, "name" | "range" | "ruleRange">) => {
    if (seen.has(decl.name)) return;
    seen.add(decl.name);
    decls.push({ symbolKind: "customProperty", ...decl });
  };

  for (const decl of args.styleDocument.customPropertyDecls) pushDecl(decl);
  if (args.styleDocumentForPath) {
    for (const target of listCustomPropertyModuleUseDeclTargets(
      args.styleDocumentForPath,
      args.styleDocument.filePath,
      args.styleDocument,
      args.aliasResolver,
      sassModuleResolutionOptions(args.readFile),
    )) {
      pushDecl(target.decl);
    }
  }
  for (const decl of args.styleDependencyGraph?.getAllCustomPropertyDecls() ?? []) pushDecl(decl);
  return decls;
}

function readSassSymbolCompletionDecls(args: {
  readonly content: string;
  readonly styleDocument: StyleDocumentHIR;
  readonly styleDocumentForPath?: (filePath: string) => StyleDocumentHIR | null;
  readonly aliasResolver?: SassModulePathAliasResolver;
  readonly readFile?: (filePath: string) => string | null;
}): readonly SassSymbolCompletionDecl[] {
  const { styleDocument, content } = args;
  const localDecls =
    styleDocument.sassSymbolDecls.length > 0
      ? styleDocument.sassSymbolDecls
      : collectFallbackSassSymbolCompletionDecls(content);
  if (!args.styleDocumentForPath) return localDecls;
  return [
    ...localDecls,
    ...collectWildcardSassSymbolCompletionDecls(
      styleDocument,
      args.styleDocumentForPath,
      args.aliasResolver,
      sassModuleResolutionOptions(args.readFile),
    ),
  ];
}

function collectWildcardSassSymbolCompletionDecls(
  styleDocument: StyleDocumentHIR,
  styleDocumentForPath: (filePath: string) => StyleDocumentHIR | null,
  aliasResolver?: SassModulePathAliasResolver,
  options: { readonly readFile?: (filePath: string) => string | null } = {},
): readonly SassSymbolCompletionDecl[] {
  const decls: SassSymbolCompletionDecl[] = [];
  const seen = new Set<string>();
  for (const moduleUse of styleDocument.sassModuleUses) {
    if (moduleUse.namespaceKind !== "wildcard") continue;
    const target = resolveSassModuleUseTarget(
      styleDocumentForPath,
      styleDocument.filePath,
      moduleUse,
      aliasResolver,
      sassModuleResolutionOptions(options.readFile),
    );
    if (!target) continue;
    for (const exportedTarget of listSassModuleExportedSymbols(
      styleDocumentForPath,
      target.filePath,
      target.styleDocument,
      aliasResolver,
      new Set(),
      sassModuleResolutionOptions(options.readFile),
    )) {
      const key = `${exportedTarget.decl.syntax ?? "sass"}:${exportedTarget.decl.symbolKind}:${
        exportedTarget.exportedName
      }`;
      if (seen.has(key)) continue;
      seen.add(key);
      decls.push({ ...exportedTarget.decl, name: exportedTarget.exportedName });
    }
  }
  return decls;
}

function sassModuleResolutionOptions(
  readFile: ((filePath: string) => string | null) | undefined,
): SassModuleResolutionOptions {
  return readFile ? { readFile } : {};
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

    const lessVariable = /^(\s*)@([A-Za-z_-][A-Za-z0-9_-]*)\s*:/u.exec(text);
    if (lessVariable) {
      decls.push(
        makeFallbackDecl("variable", lessVariable[2]!, line, lessVariable[1]!.length, "less"),
      );
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
  syntax?: StylePreprocessorSymbolSyntax,
): SassSymbolCompletionDecl {
  const range = {
    start: { line, character },
    end: {
      line,
      character: character + (symbolKind === "variable" ? name.length + 1 : name.length),
    },
  };
  return { ...(syntax ? { syntax } : {}), symbolKind, name, range, ruleRange: range };
}

function toCustomPropertyCompletionItem(
  decl: CustomPropertyCompletionDecl,
  replacementRange: Range,
): StyleCompletionItem {
  return {
    label: decl.name,
    detail: "CSS custom property",
    insertText: decl.name,
    filterText: decl.name,
    replacementRange,
    symbolKind: "customProperty",
  };
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
    ...(decl.syntax ? { symbolSyntax: decl.syntax } : {}),
    symbolKind: decl.symbolKind,
  };
}

function completionLabel(decl: SassSymbolCompletionDecl): string {
  if (decl.syntax === "less") return `@${decl.name}`;
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
      return decl.syntax === "less" ? "Less variable" : "Sass variable";
    case "mixin":
      return "Sass mixin";
    case "function":
      return "Sass function";
  }
}

function readLine(content: string, line: number): string {
  return content.split(/\r?\n/u)[line] ?? "";
}
