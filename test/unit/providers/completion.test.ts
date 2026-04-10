import { describe, expect, it, vi } from "vitest";
import type ts from "typescript";
import { CompletionItemKind } from "vscode-languageserver-protocol/node";
import type {
  CxBinding,
  CxCallInfo,
  ScssClassMap,
  SelectorInfo,
} from "@css-module-explainer/shared";
import { SourceFileCache } from "../../../server/src/core/ts/source-file-cache";
import { DocumentAnalysisCache } from "../../../server/src/core/indexing/document-analysis-cache";
import { NullReverseIndex } from "../../../server/src/core/indexing/reverse-index";
import { NOOP_LOG_ERROR, type ProviderDeps } from "../../../server/src/providers/cursor-dispatch";
import { handleCompletion } from "../../../server/src/providers/completion";
import { FakeTypeResolver } from "../../_fixtures/fake-type-resolver";

const TSX = `
import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
const el = cx('
`;

function info(name: string): SelectorInfo {
  return {
    name,
    range: { start: { line: 11, character: 2 }, end: { line: 11, character: 2 + name.length } },
    fullSelector: `.${name}`,
    declarations: `color: red`,
    ruleRange: { start: { line: 10, character: 0 }, end: { line: 13, character: 1 } },
  };
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

const parseCxCalls = (_sf: ts.SourceFile, _binding: CxBinding): CxCallInfo[] => [];

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
        ["active", info("active")],
      ]) as ScssClassMap,
    scssClassMapForPath: () => null,
    typeResolver: new FakeTypeResolver(),
    reverseIndex: new NullReverseIndex(),
    workspaceRoot: "/fake/ws",
    logError: NOOP_LOG_ERROR,
    ...overrides,
  };
}

describe("handleCompletion", () => {
  it("returns all classes when inside a cx() call", () => {
    const result = handleCompletion(
      {
        documentUri: "file:///fake/ws/src/Button.tsx",
        content: TSX,
        filePath: "/fake/ws/src/Button.tsx",
        line: 4,
        character: 16, // inside cx('
        version: 1,
      },
      makeDeps(),
    );
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result!.map((r) => r.label).toSorted()).toEqual(["active", "indicator"]);
    expect(result![0]!.kind).toBe(CompletionItemKind.Value);
  });

  it("returns null when not inside a cx call", () => {
    const result = handleCompletion(
      {
        documentUri: "file:///fake/ws/src/Button.tsx",
        content: TSX,
        filePath: "/fake/ws/src/Button.tsx",
        line: 1, // import line
        character: 0,
        version: 1,
      },
      makeDeps(),
    );
    expect(result).toBeNull();
  });

  it("returns null when file does not import classnames/bind", () => {
    const result = handleCompletion(
      {
        documentUri: "file:///fake/ws/src/Plain.tsx",
        content: "const x = 1;\n",
        filePath: "/fake/ws/src/Plain.tsx",
        line: 0,
        character: 5,
        version: 1,
      },
      makeDeps(),
    );
    expect(result).toBeNull();
  });

  it("returns null when classMap is empty", () => {
    const result = handleCompletion(
      {
        documentUri: "file:///fake/ws/src/Button.tsx",
        content: TSX,
        filePath: "/fake/ws/src/Button.tsx",
        line: 4,
        character: 16,
        version: 1,
      },
      makeDeps({ scssClassMapFor: () => new Map() as ScssClassMap }),
    );
    expect(result).toBeNull();
  });

  it("logs and returns null on exception", () => {
    const logError = vi.fn();
    const result = handleCompletion(
      {
        documentUri: "file:///fake/ws/src/Button.tsx",
        content: TSX,
        filePath: "/fake/ws/src/Button.tsx",
        line: 4,
        character: 16,
        version: 1,
      },
      makeDeps({
        scssClassMapFor: () => {
          throw new Error("boom");
        },
        logError,
      }),
    );
    expect(result).toBeNull();
    expect(logError).toHaveBeenCalledTimes(1);
  });
});
