import type {
  CallSite,
  ClassRef,
  CxBinding,
  ScssClassMap,
  SelectorInfo,
  StyleImport,
} from "@css-module-explainer/shared";
import { SourceFileCache } from "../../server/src/core/ts/source-file-cache";
import { DocumentAnalysisCache } from "../../server/src/core/indexing/document-analysis-cache";
import { NullSemanticWorkspaceReferenceIndex } from "../../server/src/core/semantic/workspace-reference-index";
import { NOOP_LOG_ERROR, type ProviderDeps } from "../../server/src/providers/cursor-dispatch";
import { DEFAULT_SETTINGS } from "../../server/src/settings";
import { AliasResolver } from "../../server/src/core/cx/alias-resolver";
import { FakeTypeResolver } from "./fake-type-resolver";
import { buildSourceDocumentFromLegacy } from "./source-compat";
import { buildStyleDocumentFromClassMap } from "./style-compat";

export const EMPTY_ALIAS_RESOLVER = new AliasResolver("/fake/ws", {});

/** Create a minimal SelectorInfo for testing (fixed line 11 position). */
export function info(name: string): SelectorInfo {
  return {
    name,
    range: { start: { line: 11, character: 2 }, end: { line: 11, character: 2 + name.length } },
    fullSelector: `.${name}`,
    declarations: "color: red",
    ruleRange: { start: { line: 10, character: 0 }, end: { line: 13, character: 1 } },
  };
}

/** Create a minimal SelectorInfo at a specific line. */
export function infoAtLine(name: string, line: number): SelectorInfo {
  return {
    name,
    range: { start: { line, character: 1 }, end: { line, character: 1 + name.length } },
    fullSelector: `.${name}`,
    declarations: "color: red",
    ruleRange: { start: { line, character: 0 }, end: { line: line + 2, character: 1 } },
  };
}

/** Create a SelectorInfo at a specific line with custom declarations. */
export function infoWithDeclarations(
  name: string,
  line: number,
  declarations: string,
): SelectorInfo {
  return {
    name,
    range: { start: { line, character: 2 }, end: { line, character: 2 + name.length } },
    fullSelector: `.${name}`,
    declarations,
    ruleRange: { start: { line, character: 0 }, end: { line: line + 3, character: 1 } },
  };
}

/**
 * Create a minimal static CallSite for testing. `canonicalName`
 * defaults to `className` (the non-alias case); tests exercising
 * alias-form access pass an explicit `canonicalName` to distinguish
 * the source token from the original SCSS key.
 */
export function siteAt(
  uri: string,
  className: string,
  line: number,
  scssPath: string = "/fake/a.module.scss",
  canonicalName: string = className,
): CallSite {
  return {
    uri,
    range: { start: { line, character: 10 }, end: { line, character: 10 + className.length } },
    scssModulePath: scssPath,
    match: { kind: "static" as const, className, canonicalName },
    expansion: "direct",
  };
}

export function semanticSiteAt(
  uri: string,
  className: string,
  line: number,
  scssPath: string = "/fake/a.module.scss",
  canonicalName: string = className,
  options: {
    start?: number;
    end?: number;
    certainty?: "exact" | "inferred" | "possible";
    reason?:
      | "literal"
      | "styleAccess"
      | "templatePrefix"
      | "typeUnion"
      | "flowLiteral"
      | "flowBranch";
    origin?: "cxCall" | "styleAccess";
  } = {},
) {
  const certainty = options.certainty ?? "exact";
  const start = options.start ?? 10;
  const end = options.end ?? start + className.length;
  return {
    refId: `ref:${uri}:${line}:${start}`,
    selectorId: `selector:${scssPath}:${canonicalName}`,
    filePath: uri.replace("file://", ""),
    uri,
    range: { start: { line, character: start }, end: { line, character: end } },
    origin: options.origin ?? "cxCall",
    scssModulePath: scssPath,
    selectorFilePath: scssPath,
    canonicalName,
    className,
    certainty,
    reason: options.reason ?? "literal",
    expansion: certainty === "exact" ? "direct" : "expanded",
  } as const;
}

export function classExpressionsFromLegacy(args: {
  readonly filePath: string;
  readonly bindings: readonly CxBinding[];
  readonly stylesBindings?: ReadonlyMap<string, StyleImport>;
  readonly classUtilNames?: readonly string[];
  readonly classRefs: readonly ClassRef[];
}) {
  return buildSourceDocumentFromLegacy({
    filePath: args.filePath,
    bindings: args.bindings,
    stylesBindings: args.stylesBindings ?? new Map(),
    classUtilNames: args.classUtilNames ?? [],
    classRefs: args.classRefs,
  }).classExpressions;
}

type BaseDepsOverrides = Partial<ProviderDeps> & {
  readonly scssClassMapForPath?: (path: string) => ScssClassMap | null;
};

/**
 * Build a default ProviderDeps with sensible empty defaults.
 *
 * Callers override individual fields via the `overrides` argument.
 * Keeps test setup DRY across hover, completion, and diagnostics tests.
 */
export function makeBaseDeps(overrides: BaseDepsOverrides = {}): ProviderDeps {
  const sourceFileCache = new SourceFileCache({ max: 10 });
  const analysisCache = new DocumentAnalysisCache({
    sourceFileCache,
    scanCxImports: () => ({ stylesBindings: new Map(), bindings: [] }),
    fileExists: () => true,
    aliasResolver: EMPTY_ALIAS_RESOLVER,
    max: 10,
  });
  const {
    scssClassMapForPath = () => null,
    styleDocumentForPath,
    ...providerOverrides
  } = overrides;
  return {
    analysisCache,
    styleDocumentForPath:
      styleDocumentForPath ??
      ((path: string) => {
        const classMap = scssClassMapForPath(path);
        return classMap ? buildStyleDocumentFromClassMap(path, classMap) : null;
      }),
    typeResolver: new FakeTypeResolver(),
    semanticReferenceIndex: new NullSemanticWorkspaceReferenceIndex(),
    workspaceRoot: "/fake/ws",
    logError: NOOP_LOG_ERROR,
    invalidateStyle: () => {},
    pushStyleFile: () => {},
    indexerReady: Promise.resolve(),
    stopIndexer: () => {},
    settings: DEFAULT_SETTINGS,
    rebuildAliasResolver: () => {},
    setClassnameTransform: () => {},
    ...providerOverrides,
  };
}
