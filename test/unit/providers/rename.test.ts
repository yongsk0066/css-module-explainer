import { describe, expect, it, vi } from "vitest";
import type {
  CallSite,
  ClassRef,
  CxBinding,
  CxCallInfo,
  ScssClassMap,
} from "@css-module-explainer/shared";
import type ts from "typescript";
import { SourceFileCache } from "../../../server/src/core/ts/source-file-cache";
import { DocumentAnalysisCache } from "../../../server/src/core/indexing/document-analysis-cache";
import { WorkspaceReverseIndex } from "../../../server/src/core/indexing/reverse-index";
import type { CursorParams, ProviderDeps } from "../../../server/src/providers/cursor-dispatch";
import { handlePrepareRename, handleRename } from "../../../server/src/providers/rename";
import { infoAtLine as info, makeBaseDeps, siteAt } from "../../_fixtures/test-helpers";

const SCSS_PATH = "/fake/src/Button.module.scss";
const SCSS_URI = "file:///fake/src/Button.module.scss";

function makeDeps(overrides: Partial<ProviderDeps> = {}): ProviderDeps {
  return makeBaseDeps({
    scssClassMapForPath: () =>
      new Map([
        ["indicator", info("indicator", 1)],
        ["active", info("active", 3)],
      ]) as ScssClassMap,
    workspaceRoot: "/fake",
    ...overrides,
  });
}

describe("handlePrepareRename", () => {
  it("returns range and placeholder for a selector at cursor in SCSS file", () => {
    const result = handlePrepareRename(
      {
        textDocument: { uri: SCSS_URI },
        position: { line: 1, character: 3 },
      },
      makeDeps(),
    );
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("range");
    expect(result).toHaveProperty("placeholder", "indicator");
  });

  it("returns null when cursor is not on a selector", () => {
    const result = handlePrepareRename(
      {
        textDocument: { uri: SCSS_URI },
        position: { line: 99, character: 0 },
      },
      makeDeps(),
    );
    expect(result).toBeNull();
  });

  it("returns null for non-style files", () => {
    const result = handlePrepareRename(
      {
        textDocument: { uri: "file:///fake/src/Button.tsx" },
        position: { line: 0, character: 0 },
      },
      makeDeps(),
    );
    expect(result).toBeNull();
  });
});

describe("handleRename", () => {
  it("builds WorkspaceEdit with SCSS selector and TS/TSX reference edits", () => {
    const idx = new WorkspaceReverseIndex();
    idx.record("file:///fake/src/App.tsx", [
      siteAt("file:///fake/src/App.tsx", "indicator", 10, SCSS_PATH),
    ]);
    idx.record("file:///fake/src/Other.tsx", [
      siteAt("file:///fake/src/Other.tsx", "indicator", 20, SCSS_PATH),
    ]);
    const result = handleRename(
      {
        textDocument: { uri: SCSS_URI },
        position: { line: 1, character: 3 },
        newName: "status",
      },
      makeDeps({ reverseIndex: idx }),
    );
    expect(result).not.toBeNull();
    const changes = result!.changes!;

    // SCSS file edit
    expect(changes[SCSS_URI]).toHaveLength(1);
    expect(changes[SCSS_URI]![0]!.newText).toBe("status");

    // TS/TSX edits
    expect(changes["file:///fake/src/App.tsx"]).toHaveLength(1);
    expect(changes["file:///fake/src/App.tsx"]![0]!.newText).toBe("status");
    expect(changes["file:///fake/src/Other.tsx"]).toHaveLength(1);
    expect(changes["file:///fake/src/Other.tsx"]![0]!.newText).toBe("status");
  });

  it("returns WorkspaceEdit with only SCSS edit when no references exist", () => {
    const result = handleRename(
      {
        textDocument: { uri: SCSS_URI },
        position: { line: 1, character: 3 },
        newName: "status",
      },
      makeDeps(),
    );
    expect(result).not.toBeNull();
    const changes = result!.changes!;
    expect(Object.keys(changes)).toEqual([SCSS_URI]);
    expect(changes[SCSS_URI]).toHaveLength(1);
  });

  it("returns null when cursor is not on a selector", () => {
    const result = handleRename(
      {
        textDocument: { uri: SCSS_URI },
        position: { line: 99, character: 0 },
        newName: "status",
      },
      makeDeps(),
    );
    expect(result).toBeNull();
  });

  it("returns null for non-style files (TS/TSX side not yet wired)", () => {
    const result = handleRename(
      {
        textDocument: { uri: "file:///fake/src/App.tsx" },
        position: { line: 0, character: 0 },
        newName: "status",
      },
      makeDeps(),
    );
    expect(result).toBeNull();
  });
});

it("logs and returns null on exception in prepareRename", () => {
  const logError = vi.fn();
  const result = handlePrepareRename(
    {
      textDocument: { uri: SCSS_URI },
      position: { line: 1, character: 3 },
    },
    makeDeps({
      scssClassMapForPath: () => {
        throw new Error("boom");
      },
      logError,
    }),
  );
  expect(result).toBeNull();
  expect(logError).toHaveBeenCalledTimes(1);
});

it("logs and returns null on exception in rename", () => {
  const logError = vi.fn();
  const result = handleRename(
    {
      textDocument: { uri: SCSS_URI },
      position: { line: 1, character: 3 },
      newName: "status",
    },
    makeDeps({
      scssClassMapForPath: () => {
        throw new Error("boom");
      },
      logError,
    }),
  );
  expect(result).toBeNull();
  expect(logError).toHaveBeenCalledTimes(1);
});

// ── TS/TSX side tests ──

const TSX_CONTENT = `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
const a = cx('indicator');
`;

const BINDING: CxBinding = {
  cxVarName: "cx",
  stylesVarName: "styles",
  scssModulePath: "/fake/src/Button.module.scss",
  classNamesImportName: "classNames",
  scope: { startLine: 0, endLine: 100 },
};

function makeTsxDeps(overrides: Partial<ProviderDeps> = {}): ProviderDeps {
  const sourceFileCache = new SourceFileCache({ max: 10 });
  const analysisCache = new DocumentAnalysisCache({
    sourceFileCache,
    collectStyleImports: () => new Map(),
    detectCxBindings: (sourceFile: ts.SourceFile): CxBinding[] => [
      {
        ...BINDING,
        scope: {
          startLine: 0,
          endLine: sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line,
        },
      },
    ],
    parseCxCalls: (_sf: ts.SourceFile, binding: CxBinding): CxCallInfo[] => [
      {
        kind: "static",
        className: "indicator",
        originRange: { start: { line: 3, character: 14 }, end: { line: 3, character: 23 } },
        scssModulePath: binding.scssModulePath,
      },
    ],
    parseClassRefs: (_sf: ts.SourceFile, bindings: readonly CxBinding[]): ClassRef[] =>
      bindings.length === 0
        ? []
        : [
            {
              kind: "static",
              origin: "cxCall",
              className: "indicator",
              originRange: {
                start: { line: 3, character: 14 },
                end: { line: 3, character: 23 },
              },
              scssModulePath: bindings[0]!.scssModulePath,
            },
          ],
    max: 10,
  });
  return makeBaseDeps({
    analysisCache,
    scssClassMapForPath: () => new Map([["indicator", info("indicator", 1)]]) as ScssClassMap,
    workspaceRoot: "/fake",
    ...overrides,
  });
}

describe("handlePrepareRename from TS/TSX", () => {
  it("returns range and placeholder for cursor on cx('indicator')", () => {
    const cursorParams: CursorParams = {
      documentUri: "file:///fake/src/App.tsx",
      content: TSX_CONTENT,
      filePath: "/fake/src/App.tsx",
      line: 3,
      character: 16,
      version: 1,
    };
    const result = handlePrepareRename(
      {
        textDocument: { uri: "file:///fake/src/App.tsx" },
        position: { line: 3, character: 16 },
      },
      makeTsxDeps(),
      cursorParams,
    );
    expect(result).not.toBeNull();
    expect(result!.placeholder).toBe("indicator");
  });
});

describe("handleRename from TS/TSX", () => {
  it("builds WorkspaceEdit when renaming from cx('indicator') in TSX", () => {
    const idx = new WorkspaceReverseIndex();
    idx.record("file:///fake/src/App.tsx", [
      siteAt("file:///fake/src/App.tsx", "indicator", 3, SCSS_PATH),
    ]);
    idx.record("file:///fake/src/Other.tsx", [
      siteAt("file:///fake/src/Other.tsx", "indicator", 20, SCSS_PATH),
    ]);
    const cursorParams: CursorParams = {
      documentUri: "file:///fake/src/App.tsx",
      content: TSX_CONTENT,
      filePath: "/fake/src/App.tsx",
      line: 3,
      character: 16,
      version: 1,
    };
    const result = handleRename(
      {
        textDocument: { uri: "file:///fake/src/App.tsx" },
        position: { line: 3, character: 16 },
        newName: "status",
      },
      makeTsxDeps({ reverseIndex: idx }),
      cursorParams,
    );
    expect(result).not.toBeNull();
    const changes = result!.changes!;

    // SCSS file edit
    const scssUri = "file:///fake/src/Button.module.scss";
    expect(changes[scssUri]).toHaveLength(1);
    expect(changes[scssUri]![0]!.newText).toBe("status");

    // TS/TSX edits
    expect(changes["file:///fake/src/App.tsx"]).toHaveLength(1);
    expect(changes["file:///fake/src/Other.tsx"]).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────────────────────
// Wave 1 Stage 1 — RED regression tests
//
// These tests encode the five critical bugs Stage 3 will fix.
// They are skipped on Stage 1 commit so the suite stays green,
// but each has been manually verified RED against pre-fix code
// (un-skip, run, confirm failure, re-skip) before landing.
// Stage 3 un-skips them in the same commit as each fix.
// ──────────────────────────────────────────────────────────────

describe("Wave 1 Stage 3.1 — rename template corruption (regression)", () => {
  // Shared fixture: `cx(`btn-${weight}`)` at range R in App.tsx, where
  // `btn-` resolves against SCSS class map containing `btn-small` and
  // `btn-large`. The reverse index holds:
  //   - one "direct" template site at R (kind: "template")
  //   - two "expanded" static sites at R (one per class name)
  // This is exactly the shape `collectCallSites` emits with a
  // CallSiteResolverContext available.
  const TEMPLATE_URI = "file:///fake/src/App.tsx";
  const TEMPLATE_RANGE = {
    start: { line: 5, character: 14 },
    end: { line: 5, character: 30 },
  };

  function buildTemplateReverseIndex(): WorkspaceReverseIndex {
    const idx = new WorkspaceReverseIndex();
    const base = { uri: TEMPLATE_URI, range: TEMPLATE_RANGE, scssModulePath: SCSS_PATH };
    const sites: CallSite[] = [
      { ...base, match: { kind: "template", staticPrefix: "btn-" }, expansion: "direct" },
      { ...base, match: { kind: "static", className: "btn-small" }, expansion: "expanded" },
      { ...base, match: { kind: "static", className: "btn-large" }, expansion: "expanded" },
    ];
    idx.record(TEMPLATE_URI, sites);
    return idx;
  }

  function btnScssDeps(idx: WorkspaceReverseIndex): ProviderDeps {
    return makeBaseDeps({
      scssClassMapForPath: () =>
        new Map([
          ["btn-small", info("btn-small", 1)],
          ["btn-large", info("btn-large", 3)],
        ]) as ScssClassMap,
      workspaceRoot: "/fake",
      reverseIndex: idx,
    });
  }

  it("rename template-literal class does NOT rewrite the template range (wave1-stage3.1)", () => {
    const idx = buildTemplateReverseIndex();
    const result = handleRename(
      {
        textDocument: { uri: SCSS_URI },
        position: { line: 1, character: 3 },
        newName: "btn-tiny",
      },
      btnScssDeps(idx),
    );
    expect(result).not.toBeNull();
    const changes = result!.changes!;

    // The SCSS selector must still be edited.
    expect(changes[SCSS_URI]).toHaveLength(1);
    expect(changes[SCSS_URI]![0]!.newText).toBe("btn-tiny");

    // The template range R must NOT appear in the App.tsx edits.
    // With the bug, this key would exist and point at TEMPLATE_RANGE,
    // destroying `btn-${weight}`. With the fix, no App.tsx edits.
    expect(changes[TEMPLATE_URI]).toBeUndefined();
  });

  it("SCSS-side prepareRename rejects class with template/variable references (wave1-stage3.1)", () => {
    const idx = buildTemplateReverseIndex();
    const result = handlePrepareRename(
      {
        textDocument: { uri: SCSS_URI },
        position: { line: 1, character: 3 },
      },
      btnScssDeps(idx),
    );
    // Cursor is on `.btn-small`, which has an expanded reverse-index
    // entry from the template. prepareRename must refuse.
    expect(result).toBeNull();
  });
});

describe("Wave 1 Stage 3.4 — &-nested prepareRename reject (red regression)", () => {
  // TODO(wave1-stage3): un-skip after fix lands
  it.skip("prepareRename rejects cursor on a &-nested selector (wave1-stage3.4)", () => {
    // Fixture: SCSS with `.button { &--primary { ... } }`.
    // Cursor on `--primary` inside the nested selector.
    // `handlePrepareRename` must return null — Wave 1 defers
    // full &-nested rename support to Wave 2 and defensively
    // rejects the request so no partial edit can corrupt
    // source.
    expect.fail("red placeholder — wave1-stage3.4");
  });
});
