import { describe, expect, it, vi } from "vitest";
import type ts from "typescript";
import { DiagnosticSeverity } from "vscode-languageserver-protocol/node";
import type { ClassRef, CxBinding, ScssClassMap } from "@css-module-explainer/shared";
import { SourceFileCache } from "../../../server/src/core/ts/source-file-cache";
import { DocumentAnalysisCache } from "../../../server/src/core/indexing/document-analysis-cache";
import { NullReverseIndex } from "../../../server/src/core/indexing/reverse-index";
import { NOOP_LOG_ERROR, type ProviderDeps } from "../../../server/src/providers/cursor-dispatch";
import { computeDiagnostics } from "../../../server/src/providers/diagnostics";
import { DEFAULT_SETTINGS } from "../../../server/src/settings";
import type { TypeResolver } from "../../../server/src/core/ts/type-resolver";
import { FakeTypeResolver } from "../../_fixtures/fake-type-resolver";
import { info, makeBaseDeps } from "../../_fixtures/test-helpers";

const TSX = `
import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
const a = cx('indicator');
const b = cx('unknonw');
`;

const detectCxBindings = (sourceFile: ts.SourceFile): CxBinding[] => [
  {
    cxVarName: "cx",
    stylesVarName: "styles",
    scssModulePath: "/fake/ws/src/Button.module.scss",
    classNamesImportName: "classNames",
    scope: {
      startLine: 0,
      endLine: sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line,
    },
  },
];

const parseClassRefs = (_sf: ts.SourceFile, bindings: readonly CxBinding[]): ClassRef[] =>
  bindings.length === 0
    ? []
    : [
        {
          kind: "static",
          origin: "cxCall",
          className: "indicator",
          originRange: { start: { line: 4, character: 14 }, end: { line: 4, character: 23 } },
          scssModulePath: bindings[0]!.scssModulePath,
        },
        {
          kind: "static",
          origin: "cxCall",
          className: "unknonw",
          originRange: { start: { line: 5, character: 14 }, end: { line: 5, character: 21 } },
          scssModulePath: bindings[0]!.scssModulePath,
        },
      ];

function makeDeps(overrides: Partial<ProviderDeps> = {}): ProviderDeps {
  const sourceFileCache = new SourceFileCache({ max: 10 });
  const analysisCache = new DocumentAnalysisCache({
    sourceFileCache,
    collectStyleImports: () => new Map(),
    fileExists: () => true,
    detectCxBindings,
    parseClassRefs,
    max: 10,
  });
  return makeBaseDeps({
    analysisCache,
    scssClassMapForPath: () =>
      new Map([
        ["indicator", info("indicator")],
        ["unknown", info("unknown")], // nearby typo target
      ]) as ScssClassMap,
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
      scssClassMapForPath: () =>
        new Map([
          ["indicator", info("indicator")],
          ["unknonw", info("unknonw")],
        ]) as ScssClassMap,
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
    expect(d.data).toEqual({ suggestion: "unknown" });
  });

  it("returns an empty array when the file does not import classnames/bind", () => {
    const result = computeDiagnostics(
      { ...baseParams, content: "const x = 1;\n", filePath: "/fake/ws/src/Plain.tsx" },
      makeDeps(),
    );
    expect(result).toEqual([]);
  });

  it("isolates per-call exceptions — one throw does not erase other diagnostics", () => {
    const logError = vi.fn();
    const result = computeDiagnostics(
      baseParams,
      makeDeps({
        scssClassMapForPath: () => {
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
    const localParseClassRefs = (_sf: ts.SourceFile, bindings: readonly CxBinding[]): ClassRef[] =>
      bindings.length === 0
        ? []
        : [
            {
              kind: "template",
              origin: "cxCall",
              rawTemplate: "prefix-${x}",
              staticPrefix: "prefix-",
              originRange: { start: { line: 4, character: 14 }, end: { line: 4, character: 28 } },
              scssModulePath: bindings[0]!.scssModulePath,
            },
          ];
    const analysisCache = new DocumentAnalysisCache({
      sourceFileCache,
      collectStyleImports: () => new Map(),
      fileExists: () => true,
      detectCxBindings,
      parseClassRefs: localParseClassRefs,
      max: 10,
    });
    const deps: ProviderDeps = {
      analysisCache,
      scssClassMapForPath: () =>
        new Map([
          ["indicator", info("indicator")],
          ["active", info("active")],
        ]) as ScssClassMap,
      typeResolver: new FakeTypeResolver(),
      reverseIndex: new NullReverseIndex(),
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
    const localParseClassRefs = (_sf: ts.SourceFile, bindings: readonly CxBinding[]): ClassRef[] =>
      bindings.length === 0
        ? []
        : [
            {
              kind: "variable",
              origin: "cxCall",
              variableName: "size",
              originRange: { start: { line: 4, character: 14 }, end: { line: 4, character: 18 } },
              scssModulePath: bindings[0]!.scssModulePath,
            },
          ];
    const analysisCache = new DocumentAnalysisCache({
      sourceFileCache,
      collectStyleImports: () => new Map(),
      fileExists: () => true,
      detectCxBindings,
      parseClassRefs: localParseClassRefs,
      max: 10,
    });
    // Union has three values but classMap only has two of them.
    class UnionResolver implements TypeResolver {
      resolve() {
        return { kind: "union" as const, values: ["small", "medium", "large"] as const };
      }
      invalidate() {}
      clear() {}
    }
    const deps: ProviderDeps = {
      analysisCache,
      scssClassMapForPath: () =>
        new Map([
          ["small", info("small")],
          ["medium", info("medium")],
        ]) as ScssClassMap,
      typeResolver: new UnionResolver(),
      reverseIndex: new NullReverseIndex(),
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
  });

  it("skips variable calls with an unresolvable type (ignoreUnresolvableUnions)", () => {
    const sourceFileCache = new SourceFileCache({ max: 10 });
    const localParseClassRefs = (_sf: ts.SourceFile, bindings: readonly CxBinding[]): ClassRef[] =>
      bindings.length === 0
        ? []
        : [
            {
              kind: "variable",
              origin: "cxCall",
              variableName: "unknown",
              originRange: { start: { line: 4, character: 14 }, end: { line: 4, character: 21 } },
              scssModulePath: bindings[0]!.scssModulePath,
            },
          ];
    const analysisCache = new DocumentAnalysisCache({
      sourceFileCache,
      collectStyleImports: () => new Map(),
      fileExists: () => true,
      detectCxBindings,
      parseClassRefs: localParseClassRefs,
      max: 10,
    });
    const deps: ProviderDeps = {
      analysisCache,
      scssClassMapForPath: () => new Map([["indicator", info("indicator")]]) as ScssClassMap,
      typeResolver: new FakeTypeResolver(), // always unresolvable
      reverseIndex: new NullReverseIndex(),
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
        scssClassMapForPath: () => {
          callCount += 1;
          if (callCount === 2) throw new Error("only the second one");
          return new Map([["indicator", info("indicator")]]) as ScssClassMap;
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

// ── Wave 2B item #11 — missing-module diagnostics ───────────────

describe("missing-module diagnostics", () => {
  const MISSING_TSX = `import styles from './typo.module.scss';\nconst a = styles.foo;\n`;

  function makeMissingDeps(overrides: Partial<ProviderDeps> = {}): ProviderDeps {
    const sourceFileCache = new SourceFileCache({ max: 10 });
    const analysisCache = new DocumentAnalysisCache({
      sourceFileCache,
      collectStyleImports: () =>
        new Map([
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
      detectCxBindings: () => [],
      fileExists: () => false,
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
      collectStyleImports: () =>
        new Map([
          [
            "styles",
            { kind: "resolved" as const, absolutePath: "/fake/ws/src/Button.module.scss" },
          ],
        ]),
      detectCxBindings: () => [],
      fileExists: () => true,
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

  it("CRITICAL placement: fires for pure styles.x file WITHOUT classnames/bind", () => {
    // This catches the v1.5.1 early-return regression.
    // The fixture contains styles.x usage but no classnames/bind
    // — pre-R2-polish the missing-module loop was gated behind
    // `params.content.includes("classnames/bind")` and never ran
    // for pure styles.x files.
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
      collectStyleImports: () => new Map(),
      detectCxBindings: () => [],
      fileExists: () => true,
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
