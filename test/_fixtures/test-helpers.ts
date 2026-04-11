import type { CallSite, SelectorInfo } from "@css-module-explainer/shared";
import { SourceFileCache } from "../../server/src/core/ts/source-file-cache";
import { DocumentAnalysisCache } from "../../server/src/core/indexing/document-analysis-cache";
import { NullReverseIndex } from "../../server/src/core/indexing/reverse-index";
import { NOOP_LOG_ERROR, type ProviderDeps } from "../../server/src/providers/cursor-dispatch";
import { DEFAULT_SETTINGS } from "../../server/src/settings";
import { AliasResolver } from "../../server/src/core/cx/alias-resolver";
import { FakeTypeResolver } from "./fake-type-resolver";

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

/**
 * Build a default ProviderDeps with sensible empty defaults.
 *
 * Callers override individual fields via the `overrides` argument.
 * Keeps test setup DRY across hover, completion, and diagnostics tests.
 */
export function makeBaseDeps(overrides: Partial<ProviderDeps> = {}): ProviderDeps {
  const sourceFileCache = new SourceFileCache({ max: 10 });
  const analysisCache = new DocumentAnalysisCache({
    sourceFileCache,
    scanCxImports: () => ({ stylesBindings: new Map(), bindings: [] }),
    fileExists: () => true,
    aliasResolver: EMPTY_ALIAS_RESOLVER,
    max: 10,
  });
  return {
    analysisCache,
    scssClassMapForPath: () => null,
    typeResolver: new FakeTypeResolver(),
    reverseIndex: new NullReverseIndex(),
    workspaceRoot: "/fake/ws",
    logError: NOOP_LOG_ERROR,
    invalidateStyle: () => {},
    pushStyleFile: () => {},
    indexerReady: Promise.resolve(),
    stopIndexer: () => {},
    settings: DEFAULT_SETTINGS,
    rebuildAliasResolver: () => {},
    setClassnameTransform: () => {},
    ...overrides,
  };
}
