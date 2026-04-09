import { describe, expect, it, vi } from "vitest";
import type ts from "typescript";
import { DiagnosticSeverity } from "vscode-languageserver-protocol/node";
import type {
  CxBinding,
  CxCallInfo,
  ResolvedType,
  ScssClassMap,
  SelectorInfo,
} from "@css-module-explainer/shared";
import { SourceFileCache } from "../../../server/src/core/ts/source-file-cache.js";
import { DocumentAnalysisCache } from "../../../server/src/core/indexing/document-analysis-cache.js";
import { NullReverseIndex } from "../../../server/src/core/indexing/reverse-index.js";
import type { TypeResolver } from "../../../server/src/core/ts/type-resolver.js";
import type { ProviderDeps } from "../../../server/src/providers/provider-utils.js";
import { computeDiagnostics } from "../../../server/src/providers/diagnostics.js";

const TSX = `
import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
const a = cx('indicator');
const b = cx('unknonw');
`;

function info(name: string): SelectorInfo {
  return {
    name,
    range: { start: { line: 11, character: 2 }, end: { line: 11, character: 2 + name.length } },
    fullSelector: `.${name}`,
    declarations: "color: red",
    ruleRange: { start: { line: 10, character: 0 }, end: { line: 13, character: 1 } },
  };
}

class FakeTypeResolver implements TypeResolver {
  resolve(): ResolvedType {
    return { kind: "unresolvable", values: [] };
  }
  invalidate(): void {}
  clear(): void {}
}

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

const parseCxCalls = (_sf: ts.SourceFile, binding: CxBinding): CxCallInfo[] => [
  {
    kind: "static",
    className: "indicator",
    originRange: { start: { line: 4, character: 14 }, end: { line: 4, character: 23 } },
    binding,
  },
  {
    kind: "static",
    className: "unknonw",
    originRange: { start: { line: 5, character: 14 }, end: { line: 5, character: 21 } },
    binding,
  },
];

function makeDeps(overrides: Partial<ProviderDeps> = {}): ProviderDeps {
  const sourceFileCache = new SourceFileCache({ max: 10 });
  const analysisCache = new DocumentAnalysisCache({
    sourceFileCache,
    detectCxBindings,
    parseCxCalls,
    max: 10,
  });
  return {
    analysisCache,
    scssClassMapFor: () =>
      new Map([
        ["indicator", info("indicator")],
        ["unknown", info("unknown")], // nearby typo target
      ]) as ScssClassMap,
    typeResolver: new FakeTypeResolver(),
    reverseIndex: new NullReverseIndex(),
    workspaceRoot: "/fake/ws",
    ...overrides,
  };
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
      scssClassMapFor: () =>
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

  it("logs and returns an empty array on exception", () => {
    const logError = vi.fn();
    const result = computeDiagnostics(
      baseParams,
      makeDeps({
        scssClassMapFor: () => {
          throw new Error("boom");
        },
        logError,
      }),
    );
    expect(result).toEqual([]);
    expect(logError).toHaveBeenCalledTimes(1);
  });
});
