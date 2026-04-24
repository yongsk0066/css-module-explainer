import {
  planSelectorRename,
  type RenameEditBlockReason,
  type SelectorRenamePlanResult,
  type SelectorRenameReadResult,
  type SelectorRenameTarget,
} from "../../engine-core-ts/src/core/rewrite/selector-rename";
import { readStyleSelectorRewritePolicy } from "../../engine-core-ts/src/core/rewrite/read-style-rewrite-policy";
import {
  findSassSymbolAtCursor,
  findSassSymbolDeclAtCursor,
  findSassSymbolDeclForSymbol,
  findSelectorAtCursor,
  listSassSymbolsForDecl,
  readSelectorRewriteSafetySummary,
} from "../../engine-core-ts/src/core/query";
import type { ResolvedReferenceSite } from "../../engine-core-ts/src/core/query/find-references";
import type { SelectorReferenceRewritePolicy } from "../../engine-core-ts/src/core/query/read-selector-rewrite-safety";
import type {
  SassSymbolDeclHIR,
  StyleDocumentHIR,
} from "../../engine-core-ts/src/core/hir/style-types";
import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";
import { pathToFileUrl } from "../../engine-core-ts/src/core/util/text-utils";
import type {
  PlannedTextEdit,
  TextRewritePlan,
} from "../../engine-core-ts/src/core/rewrite/text-rewrite-plan";
import {
  resolveSelectedQueryBackendKind,
  usesRustSelectorUsageBackend,
} from "./selected-query-backend";
import {
  buildSelectorUsageEditableDirectSitesFromRustPayload,
  resolveRustSelectorUsagePayloadForWorkspaceTarget,
  type SelectorUsageEvaluatorCandidatePayloadV0,
} from "./selector-usage-query-backend";

export interface StyleRenameQueryOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly readRustSelectorUsagePayloadForWorkspaceTarget?: typeof resolveRustSelectorUsagePayloadForWorkspaceTarget;
}

export interface SassSymbolRenameTarget {
  readonly scssPath: string;
  readonly scssUri: string;
  readonly styleDocument: StyleDocumentHIR;
  readonly symbolKind: SassSymbolDeclHIR["symbolKind"];
  readonly name: string;
  readonly targetDecl: SassSymbolDeclHIR;
  readonly placeholder: string;
  readonly placeholderRange: SassSymbolDeclHIR["range"];
}

export type SassSymbolRenameReadResult =
  | { readonly kind: "target"; readonly target: SassSymbolRenameTarget }
  | { readonly kind: "miss" };

export type StyleRenameReadResult = SelectorRenameReadResult | SassSymbolRenameReadResult;

export type SassSymbolRenamePlanResult =
  | { readonly kind: "plan"; readonly plan: TextRewritePlan<SassSymbolRenameTarget> }
  | { readonly kind: "blocked"; readonly reason: RenameEditBlockReason };

export type StyleRenamePlanResult = SelectorRenamePlanResult | SassSymbolRenamePlanResult;

export function readStyleRenameTargetAtCursor(
  filePath: string,
  line: number,
  character: number,
  styleDocument: StyleDocumentHIR,
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "settings"
    | "semanticReferenceIndex"
    | "styleDependencyGraph"
    | "styleDocumentForPath"
    | "typeResolver"
    | "workspaceRoot"
  >,
  options: StyleRenameQueryOptions = {},
): StyleRenameReadResult {
  const selectorResult = readStyleSelectorRenameTargetAtCursor(
    filePath,
    line,
    character,
    styleDocument,
    deps,
    options,
  );
  if (selectorResult.kind !== "miss") return selectorResult;
  return readSassSymbolRenameTargetAtCursor(filePath, line, character, styleDocument);
}

function readStyleSelectorRenameTargetAtCursor(
  filePath: string,
  line: number,
  character: number,
  styleDocument: StyleDocumentHIR,
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "settings"
    | "semanticReferenceIndex"
    | "styleDependencyGraph"
    | "styleDocumentForPath"
    | "typeResolver"
    | "workspaceRoot"
  >,
  options: StyleRenameQueryOptions,
): SelectorRenameReadResult {
  const selector = findSelectorAtCursor(styleDocument, line, character);
  if (!selector) return { kind: "miss" };

  const aliasMode = deps.settings.scss.classnameTransform;
  const rewritePolicy = readStyleSelectorRewritePolicy({
    styleDocument,
    selector,
    aliasMode,
    rejectAliasSelectorViews: true,
  });
  if (rewritePolicy.kind === "blocked") {
    return rewritePolicy;
  }

  const rewriteSafety = resolveStyleRenameRewriteSafety(
    filePath,
    rewritePolicy.summary.canonicalName,
    deps,
    options,
  );
  if (rewriteSafety.hasBlockingStyleDependencyReferences) {
    return { kind: "blocked", reason: "styleDependencyReferences" };
  }
  if (rewriteSafety.hasBlockingExpandedReferences) {
    return { kind: "blocked", reason: "expandedReferences" };
  }

  const target: SelectorRenameTarget = {
    scssPath: filePath,
    scssUri: pathToFileUrl(filePath),
    styleDocument,
    selector,
    styleRewritePolicy: rewritePolicy.summary,
    placeholder: selector.name,
    placeholderRange: selector.bemSuffix?.rawTokenRange ?? selector.range,
    rewriteSafety,
    aliasMode,
  };
  return {
    kind: "target",
    target,
  };
}

function readSassSymbolRenameTargetAtCursor(
  filePath: string,
  line: number,
  character: number,
  styleDocument: StyleDocumentHIR,
): SassSymbolRenameReadResult {
  const decl = findSassSymbolDeclAtCursor(styleDocument, line, character);
  if (decl) {
    return {
      kind: "target",
      target: makeSassSymbolRenameTarget(
        filePath,
        styleDocument,
        decl.symbolKind,
        decl.name,
        decl,
        decl.range,
      ),
    };
  }

  const symbol = findSassSymbolAtCursor(styleDocument, line, character);
  if (!symbol) return { kind: "miss" };
  const targetDecl = findSassSymbolDeclForSymbol(styleDocument, symbol);
  if (!targetDecl) return { kind: "miss" };
  return {
    kind: "target",
    target: makeSassSymbolRenameTarget(
      filePath,
      styleDocument,
      symbol.symbolKind,
      symbol.name,
      targetDecl,
      symbol.range,
    ),
  };
}

export function planStyleRenameAtCursor(
  filePath: string,
  line: number,
  character: number,
  styleDocument: StyleDocumentHIR,
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "settings"
    | "semanticReferenceIndex"
    | "styleDependencyGraph"
    | "styleDocumentForPath"
    | "typeResolver"
    | "workspaceRoot"
  >,
  newName: string,
  options: StyleRenameQueryOptions = {},
): StyleRenamePlanResult | null {
  const result = readStyleRenameTargetAtCursor(
    filePath,
    line,
    character,
    styleDocument,
    deps,
    options,
  );
  if (result.kind !== "target") return null;
  if (isSassSymbolRenameTarget(result.target)) {
    return planSassSymbolRename(result.target, newName);
  }
  return planSelectorRename(result.target, newName);
}

function makeSassSymbolRenameTarget(
  filePath: string,
  styleDocument: StyleDocumentHIR,
  symbolKind: SassSymbolDeclHIR["symbolKind"],
  name: string,
  targetDecl: SassSymbolDeclHIR,
  placeholderRange: SassSymbolDeclHIR["range"],
): SassSymbolRenameTarget {
  return {
    scssPath: filePath,
    scssUri: pathToFileUrl(filePath),
    styleDocument,
    symbolKind,
    name,
    targetDecl,
    placeholder: formatSassSymbolText(symbolKind, name),
    placeholderRange,
  };
}

function isSassSymbolRenameTarget(
  target: SelectorRenameTarget | SassSymbolRenameTarget,
): target is SassSymbolRenameTarget {
  return "symbolKind" in target;
}

const SASS_IDENTIFIER_RE = /^[a-zA-Z_][\w-]*$/;

function planSassSymbolRename(
  target: SassSymbolRenameTarget,
  newName: string,
): SassSymbolRenamePlanResult {
  const nextName = normalizeSassSymbolNewName(target.symbolKind, newName);
  if (!nextName) return { kind: "blocked", reason: "invalidNewName" };

  const newText = formatSassSymbolText(target.symbolKind, nextName);
  const edits: PlannedTextEdit[] = [];
  edits.push({
    uri: target.scssUri,
    range: target.targetDecl.range,
    newText,
  });
  for (const symbol of listSassSymbolsForDecl(target.styleDocument, target.targetDecl)) {
    edits.push({
      uri: target.scssUri,
      range: symbol.range,
      newText,
    });
  }

  return { kind: "plan", plan: { target, edits } };
}

function normalizeSassSymbolNewName(
  symbolKind: SassSymbolDeclHIR["symbolKind"],
  newName: string,
): string | null {
  const trimmed = newName.trim();
  if (symbolKind === "variable") {
    const name = trimmed.startsWith("$") ? trimmed.slice(1) : trimmed;
    return SASS_IDENTIFIER_RE.test(name) ? name : null;
  }
  if (trimmed.startsWith("$") || trimmed.startsWith("@")) return null;
  return SASS_IDENTIFIER_RE.test(trimmed) ? trimmed : null;
}

function formatSassSymbolText(symbolKind: SassSymbolDeclHIR["symbolKind"], name: string): string {
  return symbolKind === "variable" ? `$${name}` : name;
}

function resolveStyleRenameRewriteSafety(
  filePath: string,
  canonicalName: string,
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "settings"
    | "semanticReferenceIndex"
    | "styleDependencyGraph"
    | "styleDocumentForPath"
    | "typeResolver"
    | "workspaceRoot"
  >,
  options: StyleRenameQueryOptions,
) {
  const base = readSelectorRewriteSafetySummary(deps, filePath, canonicalName);
  if (!usesRustSelectorUsageBackend(resolveSelectedQueryBackendKind(options.env))) {
    return base;
  }

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
  if (!payload) return base;

  const hasBlockingStyleDependencyReferences = payload.hasStyleDependencyReferences;
  const hasBlockingExpandedReferences = payload.hasExpandedReferences;
  const rustEditableDirectSites = buildRustEditableDirectSites(payload);
  const referenceRewritePolicy: SelectorReferenceRewritePolicy =
    hasBlockingStyleDependencyReferences
      ? "blockedByStyleDependencies"
      : hasBlockingExpandedReferences
        ? "blockedByExpandedReferences"
        : "directOnly";
  return {
    ...base,
    usage: {
      ...base.usage,
      editableDirectSites: rustEditableDirectSites ?? base.usage.editableDirectSites,
      totalReferences: payload.totalReferences,
      directReferenceCount: payload.directReferenceCount,
      hasExpandedReferences: payload.hasExpandedReferences,
      hasStyleDependencyReferences: payload.hasStyleDependencyReferences,
      hasAnyReferences: payload.hasAnyReferences,
    },
    directSites: rustEditableDirectSites ?? base.directSites,
    referenceRewritePolicy,
    hasBlockingExpandedReferences,
    hasBlockingStyleDependencyReferences,
  };
}

function buildRustEditableDirectSites(
  payload: SelectorUsageEvaluatorCandidatePayloadV0,
): readonly ResolvedReferenceSite[] | null {
  const editableDirectSites = buildSelectorUsageEditableDirectSitesFromRustPayload(payload);
  if (!editableDirectSites) return null;
  return editableDirectSites.map((site) => ({
    uri: pathToFileUrl(site.filePath),
    range: site.range,
    className: site.className,
    selectorCertainty: "exact",
    expansion: "direct",
    referenceKind: "source",
  }));
}
