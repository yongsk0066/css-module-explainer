import path from "node:path";
import type {
  AnimationNameRefHIR,
  KeyframesDeclHIR,
  SassModuleMemberRefHIR,
  SassModuleUseHIR,
  SassSymbolDeclHIR,
  SassSymbolOccurrenceHIR,
  SelectorDeclHIR,
  StyleDocumentHIR,
  ValueDeclHIR,
  ValueImportHIR,
  ValueRefHIR,
} from "../hir/style-types";
import { rangeContains } from "../util/range-utils";
import type { ComposesClassToken, ComposesRef } from "@css-module-explainer/shared";

export function findSelectorAtCursor(
  styleDocument: StyleDocumentHIR,
  line: number,
  character: number,
): SelectorDeclHIR | null {
  for (const selector of styleDocument.selectors) {
    const hitRange = selector.bemSuffix?.rawTokenRange ?? selector.range;
    if (rangeContains(hitRange, line, character)) return selector;
  }
  return null;
}

export function findCanonicalSelector(
  styleDocument: StyleDocumentHIR,
  selector: SelectorDeclHIR,
): SelectorDeclHIR {
  if (selector.viewKind === "canonical") return selector;
  return (
    styleDocument.selectors.find(
      (candidate) =>
        candidate.canonicalName === selector.canonicalName && candidate.viewKind === "canonical",
    ) ?? selector
  );
}

export function findCanonicalSelectorsByName(
  styleDocument: StyleDocumentHIR,
  viewName: string,
): readonly SelectorDeclHIR[] {
  const matches = styleDocument.selectors.filter((selector) => selector.name === viewName);
  if (matches.length === 0) return [];
  const canonicalNames = new Set(matches.map((selector) => selector.canonicalName));
  const canonicalSelectors = styleDocument.selectors.filter(
    (selector) => selector.viewKind === "canonical" && canonicalNames.has(selector.canonicalName),
  );
  return canonicalSelectors.length > 0 ? canonicalSelectors : matches;
}

export function listCanonicalSelectors(
  styleDocument: StyleDocumentHIR,
): readonly SelectorDeclHIR[] {
  const canonicalSelectors: SelectorDeclHIR[] = [];
  const emitted = new Set<string>();

  for (const selector of styleDocument.selectors) {
    if (emitted.has(selector.canonicalName)) continue;
    emitted.add(selector.canonicalName);
    canonicalSelectors.push(findCanonicalSelector(styleDocument, selector));
  }

  return canonicalSelectors;
}

export interface ComposesTokenHit {
  readonly selector: SelectorDeclHIR;
  readonly ref: ComposesRef;
  readonly token: ComposesClassToken;
}

export interface ResolvedComposesTarget {
  readonly filePath: string;
  readonly styleDocument: StyleDocumentHIR;
  readonly selector: SelectorDeclHIR;
}

export function findComposesTokenAtCursor(
  styleDocument: StyleDocumentHIR,
  line: number,
  character: number,
): ComposesTokenHit | null {
  for (const selector of styleDocument.selectors) {
    for (const ref of selector.composes) {
      for (const token of ref.classTokens ?? []) {
        if (rangeContains(token.range, line, character)) {
          return { selector, ref, token };
        }
      }
    }
  }
  return null;
}

export function resolveComposesTarget(
  styleDocumentForPath: (filePath: string) => StyleDocumentHIR | null,
  styleFilePath: string,
  hit: ComposesTokenHit | null,
): ResolvedComposesTarget | null {
  if (!hit || hit.ref.fromGlobal) return null;

  const targetFilePath = hit.ref.from
    ? path.resolve(path.dirname(styleFilePath), hit.ref.from)
    : styleFilePath;
  const targetDocument = styleDocumentForPath(targetFilePath);
  if (!targetDocument) return null;

  const selector =
    targetDocument.selectors.find(
      (candidate) =>
        candidate.canonicalName === hit.token.className && candidate.viewKind === "canonical",
    ) ??
    targetDocument.selectors.find((candidate) => candidate.canonicalName === hit.token.className);
  if (!selector) return null;

  return {
    filePath: targetDocument.filePath,
    styleDocument: targetDocument,
    selector: findCanonicalSelector(targetDocument, selector),
  };
}

export function findKeyframesAtCursor(
  styleDocument: StyleDocumentHIR,
  line: number,
  character: number,
): KeyframesDeclHIR | null {
  for (const keyframes of styleDocument.keyframes) {
    if (rangeContains(keyframes.range, line, character)) return keyframes;
  }
  return null;
}

export function findAnimationNameRefAtCursor(
  styleDocument: StyleDocumentHIR,
  line: number,
  character: number,
): AnimationNameRefHIR | null {
  for (const ref of styleDocument.animationNameRefs) {
    if (rangeContains(ref.range, line, character)) return ref;
  }
  return null;
}

export function findKeyframesByName(
  styleDocument: StyleDocumentHIR,
  name: string,
): KeyframesDeclHIR | null {
  return styleDocument.keyframes.find((keyframes) => keyframes.name === name) ?? null;
}

export function listAnimationNameRefs(
  styleDocument: StyleDocumentHIR,
  name: string,
): readonly AnimationNameRefHIR[] {
  return styleDocument.animationNameRefs.filter((ref) => ref.name === name);
}

export function findValueDeclAtCursor(
  styleDocument: StyleDocumentHIR,
  line: number,
  character: number,
): ValueDeclHIR | null {
  for (const valueDecl of styleDocument.valueDecls) {
    if (rangeContains(valueDecl.range, line, character)) return valueDecl;
  }
  return null;
}

export function findValueRefAtCursor(
  styleDocument: StyleDocumentHIR,
  line: number,
  character: number,
): ValueRefHIR | null {
  for (const valueRef of styleDocument.valueRefs) {
    if (rangeContains(valueRef.range, line, character)) return valueRef;
  }
  return null;
}

export function findValueImportAtCursor(
  styleDocument: StyleDocumentHIR,
  line: number,
  character: number,
): ValueImportHIR | null {
  for (const valueImport of styleDocument.valueImports) {
    if (rangeContains(valueImport.range, line, character)) return valueImport;
  }
  return null;
}

export function findSassModuleUseAtCursor(
  styleDocument: StyleDocumentHIR,
  line: number,
  character: number,
): SassModuleUseHIR | null {
  for (const moduleUse of styleDocument.sassModuleUses) {
    if (rangeContains(moduleUse.range, line, character)) return moduleUse;
  }
  return null;
}

export function findSassModuleMemberRefAtCursor(
  styleDocument: StyleDocumentHIR,
  line: number,
  character: number,
): SassModuleMemberRefHIR | null {
  for (const memberRef of styleDocument.sassModuleMemberRefs) {
    if (rangeContains(memberRef.range, line, character)) return memberRef;
  }
  return null;
}

export function findValueDeclByName(
  styleDocument: StyleDocumentHIR,
  name: string,
): ValueDeclHIR | null {
  return styleDocument.valueDecls.find((valueDecl) => valueDecl.name === name) ?? null;
}

export function findValueImportByName(
  styleDocument: StyleDocumentHIR,
  name: string,
): ValueImportHIR | null {
  return styleDocument.valueImports.find((valueImport) => valueImport.name === name) ?? null;
}

export function listValueRefs(
  styleDocument: StyleDocumentHIR,
  name: string,
): readonly ValueRefHIR[] {
  return styleDocument.valueRefs.filter((valueRef) => valueRef.name === name);
}

export function findSassSymbolDeclAtCursor(
  styleDocument: StyleDocumentHIR,
  line: number,
  character: number,
): SassSymbolDeclHIR | null {
  for (const decl of styleDocument.sassSymbolDecls) {
    if (rangeContains(decl.range, line, character)) return decl;
  }
  return null;
}

export function findSassSymbolAtCursor(
  styleDocument: StyleDocumentHIR,
  line: number,
  character: number,
): SassSymbolOccurrenceHIR | null {
  for (const symbol of styleDocument.sassSymbols) {
    if (rangeContains(symbol.range, line, character)) return symbol;
  }
  return null;
}

export function findSassSymbolDeclByName(
  styleDocument: StyleDocumentHIR,
  symbolKind: SassSymbolDeclHIR["symbolKind"],
  name: string,
): SassSymbolDeclHIR | null {
  return (
    styleDocument.sassSymbolDecls.find(
      (decl) => decl.symbolKind === symbolKind && decl.name === name,
    ) ?? null
  );
}

export function findSassSymbolDeclForSymbol(
  styleDocument: StyleDocumentHIR,
  symbol: SassSymbolOccurrenceHIR,
): SassSymbolDeclHIR | null {
  const candidates = styleDocument.sassSymbolDecls.filter(
    (decl) => decl.symbolKind === symbol.symbolKind && decl.name === symbol.name,
  );
  if (candidates.length === 0) return null;
  if (symbol.symbolKind !== "variable") return candidates[0] ?? null;

  const localCandidates = candidates
    .filter((decl) => !isFileScopeSassVariableDecl(decl))
    .filter((decl) =>
      rangeContains(decl.ruleRange, symbol.range.start.line, symbol.range.start.character),
    )
    .toSorted(compareSassDeclScopeSpecificity);
  return localCandidates[0] ?? candidates.find(isFileScopeSassVariableDecl) ?? null;
}

export function listSassSymbols(
  styleDocument: StyleDocumentHIR,
  symbolKind: SassSymbolDeclHIR["symbolKind"],
  name: string,
): readonly SassSymbolOccurrenceHIR[] {
  return styleDocument.sassSymbols.filter(
    (symbol) => symbol.symbolKind === symbolKind && symbol.name === name,
  );
}

export function listSassSymbolsForDecl(
  styleDocument: StyleDocumentHIR,
  decl: SassSymbolDeclHIR,
): readonly SassSymbolOccurrenceHIR[] {
  return styleDocument.sassSymbols.filter((symbol) => {
    if (symbol.symbolKind !== decl.symbolKind || symbol.name !== decl.name) return false;
    return findSassSymbolDeclForSymbol(styleDocument, symbol) === decl;
  });
}

export function listSassModuleMemberRefsForMember(
  styleDocument: StyleDocumentHIR,
  memberRef: SassModuleMemberRefHIR,
): readonly SassModuleMemberRefHIR[] {
  return styleDocument.sassModuleMemberRefs.filter(
    (candidate) =>
      candidate.namespace === memberRef.namespace &&
      candidate.symbolKind === memberRef.symbolKind &&
      candidate.name === memberRef.name,
  );
}

function isFileScopeSassVariableDecl(decl: SassSymbolDeclHIR): boolean {
  return (
    decl.symbolKind === "variable" &&
    decl.range.start.line === decl.ruleRange.start.line &&
    decl.range.start.character === decl.ruleRange.start.character
  );
}

function compareSassDeclScopeSpecificity(a: SassSymbolDeclHIR, b: SassSymbolDeclHIR): number {
  const sizeCompare = rangeSize(a.ruleRange) - rangeSize(b.ruleRange);
  if (sizeCompare !== 0) return sizeCompare;
  const lineCompare = b.range.start.line - a.range.start.line;
  if (lineCompare !== 0) return lineCompare;
  return b.range.start.character - a.range.start.character;
}

function rangeSize(range: SassSymbolDeclHIR["range"]): number {
  return (
    (range.end.line - range.start.line) * 1_000_000 + (range.end.character - range.start.character)
  );
}

export interface ResolvedValueTarget {
  readonly filePath: string;
  readonly styleDocument: StyleDocumentHIR;
  readonly valueDecl: ValueDeclHIR;
  readonly bindingKind: "local" | "imported";
  readonly valueImport?: ValueImportHIR;
}

export interface SassModulePathAliasResolver {
  resolve(
    specifier: string,
    fileExists?: (candidate: string) => boolean,
    containingFilePath?: string,
  ): string | null;
}

export interface ResolvedSassModuleUseTarget {
  readonly filePath: string;
  readonly styleDocument: StyleDocumentHIR;
  readonly moduleUse: SassModuleUseHIR;
}

export interface ResolvedSassModuleMemberTarget {
  readonly filePath: string;
  readonly styleDocument: StyleDocumentHIR;
  readonly moduleUse: SassModuleUseHIR;
  readonly memberRef: SassModuleMemberRefHIR;
  readonly decl: SassSymbolDeclHIR;
}

const SASS_MODULE_EXTENSIONS = [".scss", ".sass", ".css"] as const;

export function listSassModuleUseCandidatePaths(
  styleFilePath: string,
  moduleUse: SassModuleUseHIR,
  aliasResolver?: SassModulePathAliasResolver,
  fileExists?: (candidate: string) => boolean,
): readonly string[] {
  const basePath = resolveSassModuleBasePath(
    styleFilePath,
    moduleUse.source,
    aliasResolver,
    fileExists,
  );
  if (!basePath) return [];
  return expandSassModuleCandidatePaths(basePath);
}

export function resolveSassModuleUseTarget(
  styleDocumentForPath: (filePath: string) => StyleDocumentHIR | null,
  styleFilePath: string,
  moduleUse: SassModuleUseHIR | null,
  aliasResolver?: SassModulePathAliasResolver,
): ResolvedSassModuleUseTarget | null {
  if (!moduleUse) return null;
  const fileExists = (candidatePath: string): boolean =>
    expandSassModuleCandidatePaths(candidatePath).some(
      (expandedPath) => styleDocumentForPath(expandedPath) !== null,
    );
  for (const candidatePath of listSassModuleUseCandidatePaths(
    styleFilePath,
    moduleUse,
    aliasResolver,
    fileExists,
  )) {
    const styleDocument = styleDocumentForPath(candidatePath);
    if (!styleDocument) continue;
    return {
      filePath: styleDocument.filePath,
      styleDocument,
      moduleUse,
    };
  }
  return null;
}

export function resolveSassModuleMemberRefTarget(
  styleDocumentForPath: (filePath: string) => StyleDocumentHIR | null,
  styleFilePath: string,
  styleDocument: StyleDocumentHIR,
  memberRef: SassModuleMemberRefHIR | null,
  aliasResolver?: SassModulePathAliasResolver,
): ResolvedSassModuleMemberTarget | null {
  if (!memberRef) return null;
  for (const moduleUse of findSassModuleUsesForNamespace(styleDocument, memberRef.namespace)) {
    const moduleTarget = resolveSassModuleUseTarget(
      styleDocumentForPath,
      styleFilePath,
      moduleUse,
      aliasResolver,
    );
    if (!moduleTarget) continue;
    const decl = findSassSymbolDeclByName(
      moduleTarget.styleDocument,
      memberRef.symbolKind,
      memberRef.name,
    );
    if (!decl) continue;
    return {
      filePath: moduleTarget.filePath,
      styleDocument: moduleTarget.styleDocument,
      moduleUse,
      memberRef,
      decl,
    };
  }
  return null;
}

function findSassModuleUsesForNamespace(
  styleDocument: StyleDocumentHIR,
  namespace: string,
): readonly SassModuleUseHIR[] {
  return styleDocument.sassModuleUses.filter(
    (moduleUse) => moduleUse.namespaceKind !== "wildcard" && moduleUse.namespace === namespace,
  );
}

function resolveSassModuleBasePath(
  styleFilePath: string,
  source: string,
  aliasResolver?: SassModulePathAliasResolver,
  fileExists?: (candidate: string) => boolean,
): string | null {
  const cleanSource = source.split(/[?#]/, 1)[0]!;
  if (cleanSource.startsWith("sass:")) return null;
  if (isRelativeSpecifier(cleanSource)) {
    return path.resolve(path.dirname(styleFilePath), cleanSource);
  }
  if (path.isAbsolute(cleanSource)) return cleanSource;
  return aliasResolver?.resolve(cleanSource, fileExists, styleFilePath) ?? null;
}

function expandSassModuleCandidatePaths(basePath: string): readonly string[] {
  const parsed = path.parse(basePath);
  const candidates: string[] = [];

  if (isStyleModuleExtension(parsed.ext)) {
    candidates.push(basePath, path.join(parsed.dir, `_${parsed.base}`));
    return uniquePaths(candidates);
  }

  for (const extension of SASS_MODULE_EXTENSIONS) {
    candidates.push(
      `${basePath}${extension}`,
      path.join(parsed.dir, `_${parsed.base}${extension}`),
      path.join(basePath, `index${extension}`),
      path.join(basePath, `_index${extension}`),
    );
  }

  return uniquePaths(candidates);
}

function isStyleModuleExtension(extension: string): boolean {
  return SASS_MODULE_EXTENSIONS.includes(extension as (typeof SASS_MODULE_EXTENSIONS)[number]);
}

function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

function uniquePaths(paths: readonly string[]): readonly string[] {
  return [...new Set(paths)];
}

export function resolveValueImportTarget(
  styleDocumentForPath: (filePath: string) => StyleDocumentHIR | null,
  styleFilePath: string,
  valueImport: ValueImportHIR | null,
): ResolvedValueTarget | null {
  if (!valueImport) return null;
  const targetFilePath = path.resolve(path.dirname(styleFilePath), valueImport.from);
  const targetDocument = styleDocumentForPath(targetFilePath);
  if (!targetDocument) return null;
  const valueDecl = findValueDeclByName(targetDocument, valueImport.importedName);
  if (!valueDecl) return null;
  return {
    filePath: targetDocument.filePath,
    styleDocument: targetDocument,
    valueDecl,
    bindingKind: "imported",
    valueImport,
  };
}

export function resolveValueTarget(
  styleDocumentForPath: (filePath: string) => StyleDocumentHIR | null,
  styleFilePath: string,
  styleDocument: StyleDocumentHIR,
  name: string,
): ResolvedValueTarget | null {
  const localDecl = findValueDeclByName(styleDocument, name);
  if (localDecl) {
    return {
      filePath: styleDocument.filePath,
      styleDocument,
      valueDecl: localDecl,
      bindingKind: "local",
    };
  }
  return resolveValueImportTarget(
    styleDocumentForPath,
    styleFilePath,
    findValueImportByName(styleDocument, name),
  );
}
