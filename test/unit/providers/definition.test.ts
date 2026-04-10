import { describe, expect, it, vi } from "vitest";
import type ts from "typescript";
import type {
  CxBinding,
  CxCallInfo,
  ScssClassMap,
  SelectorInfo,
} from "@css-module-explainer/shared";
import { SourceFileCache } from "../../../server/src/core/ts/source-file-cache.js";
import { DocumentAnalysisCache } from "../../../server/src/core/indexing/document-analysis-cache.js";
import { NullReverseIndex } from "../../../server/src/core/indexing/reverse-index.js";
import {
  NOOP_LOG_ERROR,
  type ProviderDeps,
} from "../../../server/src/providers/cursor-dispatch.js";
import { handleDefinition } from "../../../server/src/providers/definition.js";
import { FakeTypeResolver } from "../../_fixtures/fake-type-resolver.js";

const TSX = `
import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
const el = cx('indicator');
`;

function info(name: string, startChar = 0): SelectorInfo {
  return {
    name,
    range: {
      start: { line: 11, character: startChar },
      end: { line: 11, character: startChar + name.length },
    },
    fullSelector: `.${name}`,
    declarations: "color: red",
    ruleRange: {
      start: { line: 10, character: 0 },
      end: { line: 13, character: 1 },
    },
  };
}

const detectCxBindings = (sourceFile: ts.SourceFile): CxBinding[] => [
  {
    cxVarName: "cx",
    stylesVarName: "styles",
    scssModulePath: "/fake/src/Button.module.scss",
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
    originRange: {
      start: { line: 4, character: 15 },
      end: { line: 4, character: 24 },
    },
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
    scssClassMapFor: () => new Map([["indicator", info("indicator", 2)]]) as ScssClassMap,
    scssClassMapForPath: () => null,
    typeResolver: new FakeTypeResolver(),
    reverseIndex: new NullReverseIndex(),
    workspaceRoot: "/fake",
    logError: NOOP_LOG_ERROR,
    ...overrides,
  };
}

describe("handleDefinition", () => {
  const baseParams = {
    documentUri: "file:///fake/src/Button.tsx",
    content: TSX,
    filePath: "/fake/src/Button.tsx",
    line: 4,
    character: 18,
    version: 1,
  };

  it("returns a LocationLink pointing at the SCSS rule for a static call", () => {
    const deps = makeDeps();
    const result = handleDefinition(baseParams, deps);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    const link = result![0]!;
    expect(link.targetUri).toMatch(/Button\.module\.scss$/);
    expect(link.targetUri.startsWith("file://")).toBe(true);
    expect(link.originSelectionRange).toEqual({
      start: { line: 4, character: 15 },
      end: { line: 4, character: 24 },
    });
    expect(link.targetRange).toEqual({
      start: { line: 10, character: 0 },
      end: { line: 13, character: 1 },
    });
    expect(link.targetSelectionRange).toEqual({
      start: { line: 11, character: 2 },
      end: { line: 11, character: 11 },
    });
  });

  it("returns null when the cursor is not on a cx call", () => {
    const deps = makeDeps();
    const result = handleDefinition({ ...baseParams, line: 1, character: 0 }, deps);
    expect(result).toBeNull();
  });

  it("returns null when classMap has no match for the class name", () => {
    const deps = makeDeps({
      scssClassMapFor: () => new Map() as ScssClassMap,
    });
    const result = handleDefinition(baseParams, deps);
    expect(result).toBeNull();
  });

  it("returns all LocationLinks for a template-literal prefix match", () => {
    const sourceFileCache = new SourceFileCache({ max: 10 });
    const analysisCache = new DocumentAnalysisCache({
      sourceFileCache,
      detectCxBindings,
      parseCxCalls: (_sf, binding) => [
        {
          kind: "template",
          rawTemplate: "btn-${variant}",
          staticPrefix: "btn-",
          originRange: {
            start: { line: 4, character: 15 },
            end: { line: 4, character: 28 },
          },
          binding,
        },
      ],
      max: 10,
    });
    const deps: ProviderDeps = {
      analysisCache,
      scssClassMapFor: () =>
        new Map([
          ["btn", info("btn", 2)],
          ["btn-primary", info("btn-primary", 2)],
          ["btn-secondary", info("btn-secondary", 2)],
          ["indicator", info("indicator", 2)],
        ]) as ScssClassMap,
      scssClassMapForPath: () => null,
      typeResolver: new FakeTypeResolver(),
      reverseIndex: new NullReverseIndex(),
      workspaceRoot: "/fake",
      logError: NOOP_LOG_ERROR,
    };
    const result = handleDefinition(baseParams, deps);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result!.every((l) => l.targetUri.startsWith("file://"))).toBe(true);
  });

  it("logs and returns null when the underlying transform raises", () => {
    const logError = vi.fn();
    const deps = makeDeps({
      scssClassMapFor: () => {
        throw new Error("boom");
      },
      logError,
    });
    expect(() => handleDefinition(baseParams, deps)).not.toThrow();
    expect(handleDefinition(baseParams, deps)).toBeNull();
    expect(logError).toHaveBeenCalledWith("definition handler failed", expect.any(Error));
  });
});
