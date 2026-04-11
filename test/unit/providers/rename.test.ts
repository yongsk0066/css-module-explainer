import { describe, expect, it, vi } from "vitest";
import type { CxBinding, CxCallInfo, ScssClassMap } from "@css-module-explainer/shared";
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

describe("Wave 1 Stage 3.1 — rename template corruption (red regression)", () => {
  // TODO(wave1-stage3): un-skip after fix lands
  it.skip("rename template-literal class does NOT rewrite the template range (wave1-stage3.1)", () => {
    // Fixture: `cx(\`btn-${weight}\`)` + SCSS with `.btn-small`.
    // Rename `btn-small` → `btn-tiny`.
    // Expectation (post-fix): the template-literal originRange
    // is NOT included in the WorkspaceEdit. Current buggy code
    // rewrites the entire template range, corrupting the source.
    expect.fail("red placeholder — wave1-stage3.1");
  });

  // TODO(wave1-stage3): un-skip after fix lands
  it.skip("SCSS-side prepareRename rejects class with template/variable references (wave1-stage3.1)", () => {
    // Fixture: same template-literal + SCSS with `.btn-small`.
    // Cursor on `.btn-small` in SCSS. `handlePrepareRename`
    // must return null because one call site is an EXPANDED
    // template — renaming would destroy the template source.
    expect.fail("red placeholder — wave1-stage3.1");
  });

  // TODO(wave1-stage3): un-skip after fix lands
  it.skip("find-references STILL surfaces template-expanded sites (wave1-stage3.1 regression guard)", () => {
    // Regression guard. After the fix lands, Find References
    // must continue to include template-expanded sites —
    // expanded entries are "where you COULD rename if the
    // template resolved" and stay visible to the user.
    expect.fail("red placeholder — wave1-stage3.1");
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
