export type { SourceExpressionCursor, SourceExpressionQueryDeps } from "./contracts";
export {
  buildInvalidClassAnalysisMetadata,
  buildDynamicExpressionExplanation,
  describeAbstractValueReason,
  describeSelectorCertaintyReason,
  describeValueCertaintyReason,
  messageForInvalidClassFinding,
  type DynamicExpressionExplanation,
  type InvalidClassAnalysisMetadata,
} from "./explain-expression-semantics";
export {
  findAnimationNameRefAtCursor,
  findCanonicalSelector,
  findCanonicalSelectorsByName,
  findComposesTokenAtCursor,
  findKeyframesAtCursor,
  findKeyframesByName,
  findSassSymbolAtCursor,
  findSassSymbolDeclAtCursor,
  findSassSymbolDeclByName,
  findSassSymbolDeclForSymbol,
  findSassModuleUseAtCursor,
  findSelectorAtCursor,
  findValueDeclAtCursor,
  findValueDeclByName,
  findValueImportAtCursor,
  findValueImportByName,
  findValueRefAtCursor,
  listAnimationNameRefs,
  listCanonicalSelectors,
  listSassSymbols,
  listSassSymbolsForDecl,
  listValueRefs,
  listSassModuleUseCandidatePaths,
  resolveValueImportTarget,
  resolveValueTarget,
  resolveComposesTarget,
  resolveSassModuleUseTarget,
  type ResolvedSassModuleUseTarget,
  type SassModulePathAliasResolver,
} from "./find-style-selector";
export { findInvalidClassReference } from "./find-invalid-class-references";
export { isInsideCall, readCompletionContext } from "./read-completion-context";
export { readExpressionSemantics } from "./read-expression-semantics";
export { readSelectorRewriteSafetySummary } from "./read-selector-rewrite-safety";
export {
  readSelectorStyleDependencySummary,
  type SelectorStyleDependencySummary,
} from "./read-selector-style-dependencies";
export { readSelectorUsageSummary, type SelectorUsageSummary } from "./read-selector-usage";
export {
  readSourceExpressionContextAtCursor,
  type SourceExpressionContext,
} from "./read-source-expression-context";
export {
  readSourceExpressionResolution,
  type SourceExpressionResolution,
} from "./read-source-expression-resolution";
export { readStyleModuleUsageSummary } from "./read-style-module-usage";
export { resolveRefDetails, type DynamicHoverExplanation } from "./resolve-ref";
