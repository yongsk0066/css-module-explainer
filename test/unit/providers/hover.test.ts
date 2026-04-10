import { describe, expect, it, vi } from "vitest";
import type ts from "typescript";
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
import { handleHover } from "../../../server/src/providers/hover";
import { FakeTypeResolver } from "../../_fixtures/fake-type-resolver";

const TSX = `
import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
const el = cx('indicator');
`;

function info(name: string): SelectorInfo {
  return {
    name,
    range: { start: { line: 11, character: 2 }, end: { line: 11, character: 2 + name.length } },
    fullSelector: `.${name}`,
    declarations: "color: red; font-size: 14px",
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

const parseCxCalls = (_sf: ts.SourceFile, binding: CxBinding): CxCallInfo[] => [
  {
    kind: "static",
    className: "indicator",
    originRange: { start: { line: 4, character: 15 }, end: { line: 4, character: 24 } },
    binding,
  },
];

function makeDeps(overrides: Partial<ProviderDeps> = {}): ProviderDeps {
  const sourceFileCache = new SourceFileCache({ max: 10 });
  const analysisCache = new DocumentAnalysisCache({
    sourceFileCache,
    collectStyleImports: () => new Map(),
    detectCxBindings,
    parseCxCalls,
    max: 10,
  });
  return {
    analysisCache,
    scssClassMapFor: () => new Map([["indicator", info("indicator")]]) as ScssClassMap,
    scssClassMapForPath: () => null,
    typeResolver: new FakeTypeResolver(),
    reverseIndex: new NullReverseIndex(),
    workspaceRoot: "/fake/ws",
    logError: NOOP_LOG_ERROR,
    ...overrides,
  };
}

describe("handleHover", () => {
  const baseParams = {
    documentUri: "file:///fake/ws/src/Button.tsx",
    content: TSX,
    filePath: "/fake/ws/src/Button.tsx",
    line: 4,
    character: 18,
    version: 1,
  };

  it("returns a Hover with markdown for a static call", () => {
    const hover = handleHover(baseParams, makeDeps());
    expect(hover).not.toBeNull();
    expect(hover!.contents).toHaveProperty("kind", "markdown");
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain("`.indicator`");
    expect(value).toContain("Button.module.scss");
    expect(hover!.range).toEqual({
      start: { line: 4, character: 15 },
      end: { line: 4, character: 24 },
    });
  });

  it("resolves hover on a continuation line of a multi-line cx() call", () => {
    const multiLineTsx = `
import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
const el = cx(
  'indicator',
  { active: true },
);
`;
    const multiLineCalls = (_sf: ts.SourceFile, binding: CxBinding): CxCallInfo[] => [
      {
        kind: "static",
        className: "indicator",
        // 'indicator' is on line 5 (0-indexed), chars 2-13
        originRange: { start: { line: 5, character: 2 }, end: { line: 5, character: 13 } },
        binding,
      },
    ];
    const deps = makeDeps({
      analysisCache: new DocumentAnalysisCache({
        sourceFileCache: new SourceFileCache({ max: 10 }),
        collectStyleImports: () => new Map(),
        detectCxBindings,
        parseCxCalls: multiLineCalls,
        max: 10,
      }),
    });
    // Cursor on line 5 (the 'indicator' line) — no "(" on this line
    const hover = handleHover(
      { ...baseParams, content: multiLineTsx, line: 5, character: 5, version: 2 },
      deps,
    );
    expect(hover).not.toBeNull();
    expect((hover!.contents as { value: string }).value).toContain("`.indicator`");
  });

  it("returns null when the classMap has no match", () => {
    const hover = handleHover(
      baseParams,
      makeDeps({ scssClassMapFor: () => new Map() as ScssClassMap }),
    );
    expect(hover).toBeNull();
  });

  it("logs and returns null when the underlying transform raises", () => {
    const logError = vi.fn();
    const hover = handleHover(
      baseParams,
      makeDeps({
        scssClassMapFor: () => {
          throw new Error("boom");
        },
        logError,
      }),
    );
    expect(hover).toBeNull();
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith("hover handler failed", expect.any(Error));
  });
});
