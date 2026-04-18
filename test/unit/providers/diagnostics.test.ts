import { describe, expect, it, vi } from "vitest";
import type ts from "typescript";
import { DiagnosticSeverity } from "vscode-languageserver-protocol/node";
import type { Range } from "@css-module-explainer/shared";
import type { CxBinding } from "../../../server/engine-core-ts/src/core/cx/cx-types";
import type { ResolvedCxBinding } from "../../../server/engine-core-ts/src/core/cx/resolved-bindings";
import { SourceFileCache } from "../../../server/engine-core-ts/src/core/ts/source-file-cache";
import { DocumentAnalysisCache } from "../../../server/engine-core-ts/src/core/indexing/document-analysis-cache";
import { NullSemanticWorkspaceReferenceIndex } from "../../../server/engine-core-ts/src/core/semantic/workspace-reference-index";
import {
  NOOP_LOG_ERROR,
  type ProviderDeps,
} from "../../../server/lsp-server/src/providers/cursor-dispatch";
import { computeDiagnostics } from "../../../server/lsp-server/src/providers/diagnostics";
import { DEFAULT_SETTINGS } from "../../../server/engine-core-ts/src/settings";
import type { TypeResolver } from "../../../server/engine-core-ts/src/core/ts/type-resolver";
import { FakeTypeResolver } from "../../_fixtures/fake-type-resolver";
import {
  EMPTY_ALIAS_RESOLVER,
  buildTestClassExpressions,
  info,
  makeBaseDeps,
} from "../../_fixtures/test-helpers";
import { buildStyleDocumentFromSelectorMap } from "../../_fixtures/style-documents";

const TSX = `
import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
const a = cx('indicator');
const b = cx('unknonw');
`;

const detectCxBindings = (_sourceFile: ts.SourceFile): CxBinding[] => [
  {
    cxVarName: "cx",
    stylesVarName: "styles",
    scssModulePath: "/fake/ws/src/Button.module.scss",
    classNamesImportName: "classNames",
    bindingRange: {
      start: { line: 3, character: 6 },
      end: { line: 3, character: 8 },
    },
  },
];

const parseClassExpressions = (_sf: ts.SourceFile, bindings: readonly ResolvedCxBinding[]) =>
  buildTestClassExpressions({
    filePath: "/fake/ws/src/Button.tsx",
    bindings,
    expressions:
      bindings.length === 0
        ? []
        : [
            {
              kind: "literal",
              origin: "cxCall",
              className: "indicator",
              range: { start: { line: 4, character: 14 }, end: { line: 4, character: 23 } },
              scssModulePath: bindings[0]!.scssModulePath,
            },
            {
              kind: "literal",
              origin: "cxCall",
              className: "unknonw",
              range: { start: { line: 5, character: 14 }, end: { line: 5, character: 21 } },
              scssModulePath: bindings[0]!.scssModulePath,
            },
          ],
  });

function styleDocumentForSelectors(selectors: ReadonlyMap<string, ReturnType<typeof info>>) {
  return () => buildStyleDocumentFromSelectorMap("/fake/ws/src/Button.module.scss", selectors);
}

function makeDeps(overrides: Partial<ProviderDeps> = {}): ProviderDeps {
  const sourceFileCache = new SourceFileCache({ max: 10 });
  const analysisCache = new DocumentAnalysisCache({
    sourceFileCache,
    fileExists: () => true,
    aliasResolver: EMPTY_ALIAS_RESOLVER,
    scanCxImports: (sf, fp) => ({ stylesBindings: new Map(), bindings: detectCxBindings(sf, fp) }),
    parseClassExpressions,
    max: 10,
  });
  return makeBaseDeps({
    analysisCache,
    selectorMapForPath: () =>
      new Map([
        ["indicator", info("indicator")],
        ["unknown", info("unknown")], // nearby typo target
      ]),
    ...overrides,
  });
}

describe("computeDiagnostics", () => {
  const baseParams = {
    documentUri: "file:///fake/ws/src/Button.tsx",
    content: TSX,
    filePath: "/fake/ws/src/Button.tsx",
    version: 1,
  };

  it("returns an empty array when all classes resolve", () => {
    const deps = makeDeps({
      selectorMapForPath: () =>
        new Map([
          ["indicator", info("indicator")],
          ["unknonw", info("unknonw")],
        ]),
    });
    const result = computeDiagnostics(baseParams, deps);
    expect(result).toEqual([]);
  });

  it("warns on a missing static class with a did-you-mean hint", () => {
    const result = computeDiagnostics(baseParams, makeDeps());
    expect(result).toHaveLength(1);
    const d = result[0]!;
    expect(d.severity).toBe(DiagnosticSeverity.Warning);
    expect(d.message).toContain("'.unknonw'");
    expect(d.message).toContain("Did you mean 'unknown'?");
    expect(d.data).toMatchObject({
      suggestion: "unknown",
      createSelector: {
        uri: "file:///fake/ws/src/Button.module.scss",
        newText: "\n\n.unknonw {\n}\n",
      },
    });
  });

  it("returns an empty array when the file does not import classnames/bind", () => {
    const sourceFileCache = new SourceFileCache({ max: 10 });
    const result = computeDiagnostics(
      { ...baseParams, content: "const x = 1;\n", filePath: "/fake/ws/src/Plain.tsx", version: 2 },
      makeDeps({
        analysisCache: new DocumentAnalysisCache({
          sourceFileCache,
          fileExists: () => true,
          aliasResolver: EMPTY_ALIAS_RESOLVER,
          scanCxImports: () => ({ stylesBindings: new Map(), bindings: [] }),
          max: 10,
        }),
      }),
    );
    expect(result).toEqual([]);
  });

  it("isolates per-call exceptions — one throw does not erase other diagnostics", () => {
    const logError = vi.fn();
    const result = computeDiagnostics(
      baseParams,
      makeDeps({
        styleDocumentForPath: () => {
          throw new Error("boom");
        },
        logError,
      }),
    );
    // Both cx() calls throw, so we get no diagnostics but TWO
    // isolated log entries — NOT a single "abort everything"
    // entry. A single bad call must not silently drop every
    // other diagnostic in the same document.
    expect(result).toEqual([]);
    expect(logError).toHaveBeenCalledTimes(2);
    expect(logError).toHaveBeenCalledWith(
      "diagnostics per-call validation failed",
      expect.any(Error),
    );
  });

  it("warns on a template-literal call whose prefix matches nothing", () => {
    const sourceFileCache = new SourceFileCache({ max: 10 });
    const analysisCache = new DocumentAnalysisCache({
      sourceFileCache,
      fileExists: () => true,
      aliasResolver: EMPTY_ALIAS_RESOLVER,
      scanCxImports: (sf, fp) => ({
        stylesBindings: new Map(),
        bindings: detectCxBindings(sf, fp),
      }),
      parseClassExpressions: (_sf: ts.SourceFile, bindings: readonly ResolvedCxBinding[]) =>
        buildTestClassExpressions({
          filePath: "/fake/ws/src/Button.tsx",
          bindings,
          expressions:
            bindings.length === 0
              ? []
              : [
                  {
                    kind: "template",
                    origin: "cxCall",
                    rawTemplate: "prefix-${x}",
                    staticPrefix: "prefix-",
                    range: {
                      start: { line: 4, character: 14 },
                      end: { line: 4, character: 28 },
                    },
                    scssModulePath: bindings[0]!.scssModulePath,
                  },
                ],
        }),
      max: 10,
    });
    const deps: ProviderDeps = {
      analysisCache,
      styleDocumentForPath: styleDocumentForSelectors(
        new Map([
          ["indicator", info("indicator")],
          ["active", info("active")],
        ]),
      ),
      typeResolver: new FakeTypeResolver(),
      semanticReferenceIndex: new NullSemanticWorkspaceReferenceIndex(),
      workspaceRoot: "/fake/ws",
      logError: NOOP_LOG_ERROR,
      invalidateStyle: () => {},
      pushStyleFile: () => {},
      indexerReady: Promise.resolve(),
      stopIndexer: () => {},
      settings: DEFAULT_SETTINGS,
    };
    const result = computeDiagnostics(baseParams, deps);
    expect(result).toHaveLength(1);
    expect(result[0]!.message).toContain("No class starting with 'prefix-'");
  });

  it("warns on a variable call whose union has a missing member", () => {
    const sourceFileCache = new SourceFileCache({ max: 10 });
    const analysisCache = new DocumentAnalysisCache({
      sourceFileCache,
      fileExists: () => true,
      aliasResolver: EMPTY_ALIAS_RESOLVER,
      scanCxImports: (sf, fp) => ({
        stylesBindings: new Map(),
        bindings: detectCxBindings(sf, fp),
      }),
      parseClassExpressions: (_sf: ts.SourceFile, bindings: readonly ResolvedCxBinding[]) =>
        buildTestClassExpressions({
          filePath: "/fake/ws/src/Button.tsx",
          bindings,
          expressions:
            bindings.length === 0
              ? []
              : [
                  {
                    kind: "symbolRef",
                    origin: "cxCall",
                    rawReference: "size",
                    range: {
                      start: { line: 4, character: 14 },
                      end: { line: 4, character: 18 },
                    },
                    scssModulePath: bindings[0]!.scssModulePath,
                  },
                ],
        }),
      max: 10,
    });
    // Union has three values but classMap only has two of them.
    class UnionResolver implements TypeResolver {
      resolve(_filePath?: string, _variableName?: string, _workspaceRoot?: string, _range?: Range) {
        return { kind: "union" as const, values: ["small", "medium", "large"] as const };
      }
      invalidate() {}
      clear() {}
    }
    const deps: ProviderDeps = {
      analysisCache,
      styleDocumentForPath: styleDocumentForSelectors(
        new Map([
          ["small", info("small")],
          ["medium", info("medium")],
        ]),
      ),
      typeResolver: new UnionResolver(),
      semanticReferenceIndex: new NullSemanticWorkspaceReferenceIndex(),
      workspaceRoot: "/fake/ws",
      logError: NOOP_LOG_ERROR,
      invalidateStyle: () => {},
      pushStyleFile: () => {},
      indexerReady: Promise.resolve(),
      stopIndexer: () => {},
      settings: DEFAULT_SETTINGS,
    };
    const result = computeDiagnostics(baseParams, deps);
    expect(result).toHaveLength(1);
    expect(result[0]!.message).toContain("Missing class for union member");
    expect(result[0]!.message).toContain("'large'");
    expect(result[0]!.message).toContain(
      "Analysis reason: TypeScript exposed multiple string-literal candidates.",
    );
    expect(result[0]!.message).toContain("Analysis shape: bounded finite (3).");
  });

  it("warns on a variable call when local flow resolves a missing value", () => {
    const flowTsx = `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
const size = enabled ? 'small' : 'large';
const a = cx(size);
`;
    const sourceFileCache = new SourceFileCache({ max: 10 });
    const analysisCache = new DocumentAnalysisCache({
      sourceFileCache,
      fileExists: () => true,
      aliasResolver: EMPTY_ALIAS_RESOLVER,
      scanCxImports: (sf, fp) => ({
        stylesBindings: new Map(),
        bindings: detectCxBindings(sf, fp),
      }),
      parseClassExpressions: (_sf: ts.SourceFile, bindings: readonly ResolvedCxBinding[]) =>
        buildTestClassExpressions({
          filePath: "/fake/ws/src/Button.tsx",
          bindings,
          expressions:
            bindings.length === 0
              ? []
              : [
                  {
                    kind: "symbolRef",
                    origin: "cxCall",
                    rawReference: "size",
                    range: {
                      start: { line: 4, character: 13 },
                      end: { line: 4, character: 17 },
                    },
                    scssModulePath: bindings[0]!.scssModulePath,
                  },
                ],
        }),
      max: 10,
    });
    const deps: ProviderDeps = {
      analysisCache,
      styleDocumentForPath: styleDocumentForSelectors(new Map([["small", info("small")]])),
      typeResolver: new FakeTypeResolver(),
      semanticReferenceIndex: new NullSemanticWorkspaceReferenceIndex(),
      workspaceRoot: "/fake/ws",
      logError: NOOP_LOG_ERROR,
      invalidateStyle: () => {},
      pushStyleFile: () => {},
      indexerReady: Promise.resolve(),
      stopIndexer: () => {},
      settings: DEFAULT_SETTINGS,
    };
    const result = computeDiagnostics({ ...baseParams, content: flowTsx }, deps);
    expect(result).toHaveLength(1);
    expect(result[0]!.message).toContain("Missing class for possible value");
    expect(result[0]!.message).toContain("'large'");
    expect(result[0]!.message).toContain(
      "Analysis reason: analysis preserved multiple finite candidate values.",
    );
    expect(result[0]!.message).toContain("Analysis shape: bounded finite (2).");
  });

  it("skips variable calls with an unresolvable type (ignoreUnresolvableUnions)", () => {
    const sourceFileCache = new SourceFileCache({ max: 10 });
    const analysisCache = new DocumentAnalysisCache({
      sourceFileCache,
      fileExists: () => true,
      aliasResolver: EMPTY_ALIAS_RESOLVER,
      scanCxImports: (sf, fp) => ({
        stylesBindings: new Map(),
        bindings: detectCxBindings(sf, fp),
      }),
      parseClassExpressions: (_sf: ts.SourceFile, bindings: readonly ResolvedCxBinding[]) =>
        buildTestClassExpressions({
          filePath: "/fake/ws/src/Button.tsx",
          bindings,
          expressions:
            bindings.length === 0
              ? []
              : [
                  {
                    kind: "symbolRef",
                    origin: "cxCall",
                    rawReference: "unknown",
                    range: {
                      start: { line: 4, character: 14 },
                      end: { line: 4, character: 21 },
                    },
                    scssModulePath: bindings[0]!.scssModulePath,
                  },
                ],
        }),
      max: 10,
    });
    const deps: ProviderDeps = {
      analysisCache,
      styleDocumentForPath: styleDocumentForSelectors(new Map([["indicator", info("indicator")]])),
      typeResolver: new FakeTypeResolver(), // always unresolvable
      semanticReferenceIndex: new NullSemanticWorkspaceReferenceIndex(),
      workspaceRoot: "/fake/ws",
      logError: NOOP_LOG_ERROR,
      invalidateStyle: () => {},
      pushStyleFile: () => {},
      indexerReady: Promise.resolve(),
      stopIndexer: () => {},
      settings: DEFAULT_SETTINGS,
    };
    const result = computeDiagnostics(baseParams, deps);
    expect(result).toEqual([]);
  });

  it("keeps clean diagnostics when one call throws — per-call isolation", () => {
    const logError = vi.fn();
    // Throw only for 'unknonw', succeed for 'indicator'.
    let callCount = 0;
    const result = computeDiagnostics(
      baseParams,
      makeDeps({
        selectorMapForPath: () => {
          callCount += 1;
          if (callCount === 2) throw new Error("only the second one");
          return new Map([["indicator", info("indicator")]]);
        },
        logError,
      }),
    );
    // 'indicator' resolved cleanly → zero diagnostics for it.
    // 'unknonw' threw → isolated, logged, does not erase the
    // rest. Final diagnostics is [] because 'indicator' was
    // clean and 'unknonw' was dropped by the catch. The win is
    // that the throw didn't propagate outward.
    expect(result).toEqual([]);
    expect(logError).toHaveBeenCalledTimes(1);
  });
});

// ── missing-module diagnostics ───────────────────────────────

describe("missing-module diagnostics", () => {
  const MISSING_TSX = `import styles from './typo.module.scss';\nconst a = styles.foo;\n`;

  function makeMissingDeps(overrides: Partial<ProviderDeps> = {}): ProviderDeps {
    const sourceFileCache = new SourceFileCache({ max: 10 });
    const analysisCache = new DocumentAnalysisCache({
      sourceFileCache,
      scanCxImports: () => ({
        stylesBindings: new Map([
          [
            "styles",
            {
              kind: "missing" as const,
              absolutePath: "/fake/ws/src/typo.module.scss",
              specifier: "./typo.module.scss",
              range: {
                start: { line: 0, character: 19 },
                end: { line: 0, character: 38 },
              },
            },
          ],
        ]),
        bindings: [],
      }),
      fileExists: () => false,
      aliasResolver: EMPTY_ALIAS_RESOLVER,
      max: 10,
    });
    return makeBaseDeps({ analysisCache, workspaceRoot: "/fake/ws", ...overrides });
  }

  it("emits one diagnostic per missing import with code 'missing-module'", () => {
    const deps = makeMissingDeps();
    const result = computeDiagnostics(
      {
        documentUri: "file:///fake/ws/src/App.tsx",
        content: MISSING_TSX,
        filePath: "/fake/ws/src/App.tsx",
        version: 1,
      },
      deps,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe("missing-module");
    expect(result[0]!.message).toContain("./typo.module.scss");
    expect(result[0]!.range.start).toEqual({ line: 0, character: 19 });
    expect(result[0]!.range.end).toEqual({ line: 0, character: 38 });
    expect(result[0]!.data).toEqual({
      createModuleFile: {
        uri: "file:///fake/ws/src/typo.module.scss",
      },
    });
  });

  it("does not emit when diagnostics.missingModule is false", () => {
    const deps = makeMissingDeps({
      settings: {
        ...makeBaseDeps().settings,
        diagnostics: {
          ...makeBaseDeps().settings.diagnostics,
          missingModule: false,
        },
      },
    });
    const result = computeDiagnostics(
      {
        documentUri: "file:///fake/ws/src/App.tsx",
        content: MISSING_TSX,
        filePath: "/fake/ws/src/App.tsx",
        version: 1,
      },
      deps,
    );
    expect(result).toEqual([]);
  });

  it("does not emit missing-module for a resolved import", () => {
    const sourceFileCache = new SourceFileCache({ max: 10 });
    const analysisCache = new DocumentAnalysisCache({
      sourceFileCache,
      scanCxImports: () => ({
        stylesBindings: new Map([
          [
            "styles",
            { kind: "resolved" as const, absolutePath: "/fake/ws/src/Button.module.scss" },
          ],
        ]),
        bindings: [],
      }),
      fileExists: () => true,
      aliasResolver: EMPTY_ALIAS_RESOLVER,
      max: 10,
    });
    const deps = makeBaseDeps({ analysisCache });
    const result = computeDiagnostics(
      {
        documentUri: "file:///fake/ws/src/App.tsx",
        content: "import styles from './Button.module.scss';\n",
        filePath: "/fake/ws/src/App.tsx",
        version: 1,
      },
      deps,
    );
    const missing = result.filter((d) => d.code === "missing-module");
    expect(missing).toEqual([]);
  });

  it("missing-module check fires on pure styles.x access without a classnames/bind import", () => {
    // The fixture deliberately omits `classnames/bind` so the
    // only hook for the missing-module loop is the `styles.x`
    // property access. Pins that the loop does NOT gate on a
    // `classnames/bind` token being present in the file, so
    // plain CSS Modules consumers still get diagnostics.
    const PURE_STYLES_TSX = `import styles from './typo.module.scss';\nexport const A = () => styles.a;\n`;
    const deps = makeMissingDeps();
    const result = computeDiagnostics(
      {
        documentUri: "file:///fake/ws/src/App.tsx",
        content: PURE_STYLES_TSX,
        filePath: "/fake/ws/src/App.tsx",
        version: 1,
      },
      deps,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe("missing-module");
  });

  it("returns empty for a file with no style imports at all", () => {
    const sourceFileCache = new SourceFileCache({ max: 10 });
    const analysisCache = new DocumentAnalysisCache({
      sourceFileCache,
      scanCxImports: () => ({ stylesBindings: new Map(), bindings: [] }),
      fileExists: () => true,
      aliasResolver: EMPTY_ALIAS_RESOLVER,
      max: 10,
    });
    const deps = makeBaseDeps({ analysisCache });
    const result = computeDiagnostics(
      {
        documentUri: "file:///fake/ws/src/App.tsx",
        content: "import React from 'react';\nexport const A = () => null;\n",
        filePath: "/fake/ws/src/App.tsx",
        version: 1,
      },
      deps,
    );
    expect(result).toEqual([]);
  });
});
