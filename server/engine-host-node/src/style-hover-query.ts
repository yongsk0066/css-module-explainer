import type { Range } from "@css-module-explainer/shared";
import {
  findAnimationNameRefAtCursor,
  findCanonicalSelector,
  findComposesTokenAtCursor,
  findKeyframesAtCursor,
  findKeyframesByName,
  findSassModuleMemberRefAtCursor,
  findSassSymbolAtCursor,
  findSassSymbolDeclAtCursor,
  findSassSymbolDeclForSymbol,
  findSelectorAtCursor,
  findValueDeclAtCursor,
  findValueImportAtCursor,
  findValueRefAtCursor,
  listAnimationNameRefs,
  listSassModuleMemberRefsForMember,
  listSassSymbolsForDecl,
  listSassWildcardSymbolsForTarget,
  listValueRefs,
  readSelectorStyleDependencySummary,
  readSelectorUsageSummary,
  resolveComposesTarget,
  resolveSassModuleMemberRefTarget,
  resolveSassWildcardSymbolTarget,
  resolveValueImportTarget,
  resolveValueTarget,
} from "../../engine-core-ts/src/core/query";
import type {
  KeyframesDeclHIR,
  SassSymbolDeclHIR,
  SelectorDeclHIR,
  StyleDocumentHIR,
  ValueDeclHIR,
} from "../../engine-core-ts/src/core/hir/style-types";
import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";
import {
  resolveSelectedQueryBackendKind,
  usesRustSelectorUsageBackend,
} from "./selected-query-backend";
import {
  buildSelectorUsageRenderSummaryFromRustPayload,
  resolveRustSelectorUsagePayloadForWorkspaceTarget,
  type SelectorUsageRenderSummary,
} from "./selector-usage-query-backend";
import {
  resolveRustStyleSelectorIdentityReadModelForWorkspaceTarget,
  type StyleSelectorIdentityQueryOptions,
} from "./style-selector-identity-query";
import {
  buildSelectorReferenceRenderSummaryFromRustGraph,
  resolveRustStyleSelectorReferenceSummaryForWorkspaceTarget,
} from "./style-selector-reference-query";
import type { StyleSemanticGraphSelectorIdentityReadModel } from "./style-semantic-graph-query-backend";

export interface StyleSelectorHoverResult {
  readonly kind: "selector";
  readonly selector: SelectorDeclHIR;
  readonly range: Range;
  readonly scssModulePath: string;
  readonly usageSummary: SelectorUsageRenderSummary;
  readonly styleDependencies: ReturnType<typeof readSelectorStyleDependencySummary>;
  readonly selectorIdentity?: StyleSemanticGraphSelectorIdentityReadModel;
  readonly headingName?: string;
  readonly note?: string;
}

export interface StyleKeyframesHoverResult {
  readonly kind: "keyframes";
  readonly keyframes: KeyframesDeclHIR;
  readonly range: Range;
  readonly scssModulePath: string;
  readonly referenceCount: number;
  readonly headingName?: string;
  readonly note?: string;
}

export interface StyleValueHoverResult {
  readonly kind: "value";
  readonly valueDecl: ValueDeclHIR;
  readonly range: Range;
  readonly scssModulePath: string;
  readonly referenceCount: number;
  readonly headingName?: string;
  readonly note?: string;
}

export interface StyleSassSymbolHoverResult {
  readonly kind: "sassSymbol";
  readonly sassSymbolDecl: SassSymbolDeclHIR;
  readonly range: Range;
  readonly scssModulePath: string;
  readonly referenceCount: number;
  readonly headingName?: string;
  readonly note?: string;
}

export type StyleHoverResult =
  | StyleSelectorHoverResult
  | StyleKeyframesHoverResult
  | StyleValueHoverResult
  | StyleSassSymbolHoverResult;

export interface StyleHoverQueryOptions extends StyleSelectorIdentityQueryOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly readRustSelectorUsagePayloadForWorkspaceTarget?: typeof resolveRustSelectorUsagePayloadForWorkspaceTarget;
}

export function resolveStyleHoverResult(
  args: {
    readonly filePath: string;
    readonly line: number;
    readonly character: number;
  },
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "styleDocumentForPath"
    | "typeResolver"
    | "semanticReferenceIndex"
    | "styleDependencyGraph"
    | "workspaceRoot"
    | "settings"
    | "aliasResolver"
    | "readStyleFile"
  >,
  options: StyleHoverQueryOptions = {},
): StyleHoverResult | null {
  const styleDocument = deps.styleDocumentForPath(args.filePath);
  if (!styleDocument) return null;

  const selectorHover = resolveStyleSelectorHoverResultForDocument(
    styleDocument,
    args,
    deps,
    options,
  );
  if (selectorHover) return selectorHover;

  const keyframes = findKeyframesAtCursor(styleDocument, args.line, args.character);
  if (keyframes) {
    return {
      kind: "keyframes",
      keyframes,
      range: keyframes.range,
      scssModulePath: args.filePath,
      referenceCount: listAnimationNameRefs(styleDocument, keyframes.name).length,
    };
  }

  const valueDecl = findValueDeclAtCursor(styleDocument, args.line, args.character);
  if (valueDecl) {
    return {
      kind: "value",
      valueDecl,
      range: valueDecl.range,
      scssModulePath: args.filePath,
      referenceCount: listValueRefs(styleDocument, valueDecl.name).length,
    };
  }

  const valueImport = findValueImportAtCursor(styleDocument, args.line, args.character);
  if (valueImport) {
    const targetValue = resolveValueImportTarget(
      deps.styleDocumentForPath,
      styleDocument.filePath,
      valueImport,
    );
    if (!targetValue) return null;
    return {
      kind: "value",
      valueDecl: targetValue.valueDecl,
      range: valueImport.range,
      headingName: valueImport.name,
      note: `Imported from \`${valueImport.from}\` as \`${valueImport.importedName}\``,
      scssModulePath: targetValue.filePath,
      referenceCount: listValueRefs(styleDocument, valueImport.name).length,
    };
  }

  const sassSymbolDecl = findSassSymbolDeclAtCursor(styleDocument, args.line, args.character);
  if (sassSymbolDecl) {
    const incomingModuleMemberRefs = deps.styleDependencyGraph.getIncomingSassModuleMemberRefs(
      args.filePath,
      sassSymbolDecl.symbolKind,
      sassSymbolDecl.name,
    );
    return {
      kind: "sassSymbol",
      sassSymbolDecl,
      range: sassSymbolDecl.range,
      scssModulePath: args.filePath,
      referenceCount:
        listSassSymbolsForDecl(styleDocument, sassSymbolDecl).length +
        incomingModuleMemberRefs.length,
    };
  }

  const animationRef = findAnimationNameRefAtCursor(styleDocument, args.line, args.character);
  if (animationRef) {
    const targetKeyframes = findKeyframesByName(styleDocument, animationRef.name);
    if (!targetKeyframes) return null;
    return {
      kind: "keyframes",
      keyframes: targetKeyframes,
      range: animationRef.range,
      headingName: animationRef.name,
      note: `Referenced via \`${animationRef.property}\``,
      scssModulePath: args.filePath,
      referenceCount: listAnimationNameRefs(styleDocument, targetKeyframes.name).length,
    };
  }

  const sassSymbol = findSassSymbolAtCursor(styleDocument, args.line, args.character);
  if (sassSymbol) {
    const target = findSassSymbolDeclForSymbol(styleDocument, sassSymbol);
    if (!target) {
      const wildcardTarget = resolveSassWildcardSymbolTarget(
        deps.styleDocumentForPath,
        styleDocument.filePath,
        styleDocument,
        sassSymbol,
        deps.aliasResolver,
      );
      if (!wildcardTarget) return null;
      return {
        kind: "sassSymbol",
        sassSymbolDecl: wildcardTarget.decl,
        range: sassSymbol.range,
        headingName: sassSymbol.name,
        note: `Referenced via Sass wildcard ${sassSymbol.role}`,
        scssModulePath: wildcardTarget.filePath,
        referenceCount: listSassWildcardSymbolsForTarget(styleDocument, wildcardTarget).length,
      };
    }
    return {
      kind: "sassSymbol",
      sassSymbolDecl: target,
      range: sassSymbol.range,
      headingName: sassSymbol.name,
      note: `Referenced via ${styleSymbolLanguageName(target)} ${sassSymbol.role}`,
      scssModulePath: args.filePath,
      referenceCount: listSassSymbolsForDecl(styleDocument, target).length,
    };
  }

  const sassModuleMemberRef = findSassModuleMemberRefAtCursor(
    styleDocument,
    args.line,
    args.character,
  );
  if (sassModuleMemberRef) {
    const target = resolveSassModuleMemberRefTarget(
      deps.styleDocumentForPath,
      styleDocument.filePath,
      styleDocument,
      sassModuleMemberRef,
      deps.aliasResolver,
    );
    if (!target) return null;
    return {
      kind: "sassSymbol",
      sassSymbolDecl: target.decl,
      range: sassModuleMemberRef.range,
      headingName: `${sassModuleMemberRef.namespace}.${sassModuleMemberRef.name}`,
      note: `Referenced via Sass module ${sassModuleMemberRef.role}`,
      scssModulePath: target.filePath,
      referenceCount:
        deps.styleDependencyGraph.getIncomingSassModuleMemberRefs(
          target.filePath,
          target.decl.symbolKind,
          target.decl.name,
        ).length || listSassModuleMemberRefsForMember(styleDocument, sassModuleMemberRef).length,
    };
  }

  const valueRef = findValueRefAtCursor(styleDocument, args.line, args.character);
  if (!valueRef) return null;
  const targetValue = resolveValueTarget(
    deps.styleDocumentForPath,
    styleDocument.filePath,
    styleDocument,
    valueRef.name,
  );
  if (!targetValue) return null;
  return {
    kind: "value",
    valueDecl: targetValue.valueDecl,
    range: valueRef.range,
    headingName: valueRef.name,
    note:
      targetValue.bindingKind === "imported"
        ? `Referenced via \`${valueRef.source === "declaration" ? "declaration value" : "@value"}\`; imported from \`${targetValue.valueImport!.from}\` as \`${targetValue.valueImport!.importedName}\``
        : `Referenced via \`${valueRef.source === "declaration" ? "declaration value" : "@value"}\``,
    scssModulePath: targetValue.filePath,
    referenceCount: listValueRefs(styleDocument, valueRef.name).length,
  };
}

export function resolveStyleSelectorHoverResult(
  args: {
    readonly filePath: string;
    readonly line: number;
    readonly character: number;
  },
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "styleDocumentForPath"
    | "typeResolver"
    | "semanticReferenceIndex"
    | "styleDependencyGraph"
    | "workspaceRoot"
    | "settings"
    | "readStyleFile"
  >,
  options: StyleHoverQueryOptions = {},
): StyleSelectorHoverResult | null {
  const styleDocument = deps.styleDocumentForPath(args.filePath);
  if (!styleDocument) return null;

  return resolveStyleSelectorHoverResultForDocument(styleDocument, args, deps, options);
}

function resolveStyleSelectorHoverResultForDocument(
  styleDocument: StyleDocumentHIR,
  args: {
    readonly filePath: string;
    readonly line: number;
    readonly character: number;
  },
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "styleDocumentForPath"
    | "typeResolver"
    | "semanticReferenceIndex"
    | "styleDependencyGraph"
    | "workspaceRoot"
    | "settings"
    | "readStyleFile"
  >,
  options: StyleHoverQueryOptions,
): StyleSelectorHoverResult | null {
  const selector = findSelectorAtCursor(styleDocument, args.line, args.character);
  if (selector) {
    const canonicalSelector = findCanonicalSelector(styleDocument, selector);
    return {
      kind: "selector",
      selector: canonicalSelector,
      range: selector.bemSuffix?.rawTokenRange ?? selector.range,
      scssModulePath: args.filePath,
      usageSummary: resolveStyleSelectorUsageSummary(
        deps,
        args.filePath,
        canonicalSelector.canonicalName,
        options,
      ),
      styleDependencies: readSelectorStyleDependencySummary(
        deps.styleDependencyGraph,
        args.filePath,
        canonicalSelector.canonicalName,
      ),
      ...withStyleSelectorIdentity(
        deps,
        styleDocument,
        args.filePath,
        canonicalSelector.canonicalName,
        options,
      ),
    };
  }

  const composesHit = findComposesTokenAtCursor(styleDocument, args.line, args.character);
  const target = resolveComposesTarget(
    deps.styleDocumentForPath,
    styleDocument.filePath,
    composesHit,
  );
  if (!composesHit || !target) return null;

  return {
    kind: "selector",
    selector: target.selector,
    range: composesHit.token.range,
    scssModulePath: target.filePath,
    usageSummary: resolveStyleSelectorUsageSummary(
      deps,
      target.filePath,
      target.selector.canonicalName,
      options,
    ),
    styleDependencies: readSelectorStyleDependencySummary(
      deps.styleDependencyGraph,
      target.filePath,
      target.selector.canonicalName,
    ),
    ...withStyleSelectorIdentity(
      deps,
      target.styleDocument,
      target.filePath,
      target.selector.canonicalName,
      options,
    ),
    headingName: composesHit.token.className,
    note: `Referenced via \`composes\` from \`.${composesHit.selector.name}\``,
  };
}

function resolveStyleSelectorUsageSummary(
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "styleDocumentForPath"
    | "typeResolver"
    | "semanticReferenceIndex"
    | "styleDependencyGraph"
    | "workspaceRoot"
    | "settings"
    | "readStyleFile"
  >,
  filePath: string,
  canonicalName: string,
  options: StyleHoverQueryOptions,
): SelectorUsageRenderSummary {
  const backend = resolveSelectedQueryBackendKind(options.env);
  const graphReferences = resolveRustStyleSelectorReferenceSummaryForWorkspaceTarget(
    { filePath, canonicalName },
    deps,
    options,
  );
  if (graphReferences) {
    return buildSelectorReferenceRenderSummaryFromRustGraph(graphReferences);
  }

  if (usesRustSelectorUsageBackend(backend)) {
    const payload = (
      options.readRustSelectorUsagePayloadForWorkspaceTarget ??
      resolveRustSelectorUsagePayloadForWorkspaceTarget
    )(
      {
        workspaceRoot: deps.workspaceRoot,
        classnameTransform: deps.settings.scss.classnameTransform,
        pathAlias: deps.settings.pathAlias,
      },
      deps,
      filePath,
      canonicalName,
    );
    if (payload) {
      return buildSelectorUsageRenderSummaryFromRustPayload(payload);
    }
  }

  const usage = readSelectorUsageSummary(
    {
      semanticReferenceIndex: deps.semanticReferenceIndex,
      styleDependencyGraph: deps.styleDependencyGraph,
      styleDocumentForPath: deps.styleDocumentForPath,
    },
    filePath,
    canonicalName,
  );
  return usage;
}

function withStyleSelectorIdentity(
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "styleDocumentForPath"
    | "typeResolver"
    | "workspaceRoot"
    | "settings"
    | "readStyleFile"
  >,
  styleDocument: StyleDocumentHIR,
  filePath: string,
  canonicalName: string,
  options: StyleHoverQueryOptions,
): { readonly selectorIdentity?: StyleSemanticGraphSelectorIdentityReadModel } {
  const selectorIdentity = resolveRustStyleSelectorIdentityReadModelForWorkspaceTarget(
    {
      filePath,
      styleDocument,
      canonicalName,
    },
    deps,
    options,
  );
  return selectorIdentity ? { selectorIdentity } : {};
}

function styleSymbolLanguageName(decl: SassSymbolDeclHIR): "Sass" | "Less" {
  return decl.syntax === "less" ? "Less" : "Sass";
}
