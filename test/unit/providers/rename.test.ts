import { describe, expect, it, vi } from "vitest";
import type {
  CallSite,
  ClassRef,
  CxBinding,
  ScssClassMap,
  SelectorInfo,
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
    fileExists: () => true,
    detectCxBindings: (sourceFile: ts.SourceFile): CxBinding[] => [
      {
        ...BINDING,
        scope: {
          startLine: 0,
          endLine: sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line,
        },
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

describe("prepareRename through real parseStyleModule (regression)", () => {
  // These tests exercise prepareRenameFromScss against ScssClassMaps
  // built by the real `parseStyleModule`, to catch regressions where
  // a nested rule silently flips a flat parent's `isNested` flag and
  // causes rename to be rejected on the flat parent.
  it("`.button { &:hover {} }` — rename is accepted on the flat .button", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const classMap = parseStyleModule(
      `.button {\n  color: red;\n  &:hover { color: blue; }\n}`,
      "/fake/src/Button.module.scss",
    );
    const deps = makeBaseDeps({
      scssClassMapForPath: () => classMap,
      workspaceRoot: "/fake",
    });
    const result = handlePrepareRename(
      {
        textDocument: { uri: SCSS_URI },
        position: { line: 0, character: 3 },
      },
      deps,
    );
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("placeholder", "button");
  });

  it("`.button { &--primary {} }` — both flat .button and nested &--primary are renameable", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const classMap = parseStyleModule(
      `.button {\n  color: red;\n  &--primary { background: blue; }\n}`,
      "/fake/src/Button.module.scss",
    );
    const deps = makeBaseDeps({
      scssClassMapForPath: () => classMap,
      workspaceRoot: "/fake",
    });
    // Cursor on `.button` at the flat rule — accepted.
    const flat = handlePrepareRename(
      {
        textDocument: { uri: SCSS_URI },
        position: { line: 0, character: 3 },
      },
      deps,
    );
    expect(flat).not.toBeNull();
    expect(flat).toHaveProperty("placeholder", "button");

    // Cursor on the nested `&--primary` — now ACCEPTED in Wave 2A.
    // Placeholder is the resolved class name `"button--primary"`;
    // range covers the `&--primary` slice (10 chars) on its line.
    const nestedInfo = classMap.get("button--primary")!;
    const rawRange = nestedInfo.bemSuffix!.rawTokenRange;
    const nested = handlePrepareRename(
      {
        textDocument: { uri: SCSS_URI },
        position: {
          line: rawRange.start.line,
          character: rawRange.start.character + 1,
        },
      },
      deps,
    );
    expect(nested).not.toBeNull();
    expect(nested).toHaveProperty("placeholder", "button--primary");
    expect((nested as { range: { end: { character: number } } }).range.end.character).toBe(
      rawRange.start.character + 10,
    );
  });
});

describe("&-nested BEM suffix rename", () => {
  // Positive cases (4): strict red→green for BEM-safe shapes.
  it("prepareRename on `&--primary` returns range covering only `&--primary` (10 chars)", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const classMap = parseStyleModule(
      `.button {\n  &--primary { color: white; }\n}`,
      "/fake/src/Button.module.scss",
    );
    const deps = makeBaseDeps({
      scssClassMapForPath: () => classMap,
      workspaceRoot: "/fake",
    });
    const rawRange = classMap.get("button--primary")!.bemSuffix!.rawTokenRange;
    const result = handlePrepareRename(
      {
        textDocument: { uri: SCSS_URI },
        position: { line: rawRange.start.line, character: rawRange.start.character + 1 },
      },
      deps,
    );
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("placeholder", "button--primary");
    const range = (
      result as { range: { start: { character: number }; end: { character: number } } }
    ).range;
    expect(range.end.character - range.start.character).toBe(10);
  });

  it("rename `button--primary → button--tiny`: SCSS edits only `--primary` slice, TSX full", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const classMap = parseStyleModule(
      `.button {\n  &--primary { color: white; }\n}`,
      "/fake/src/Button.module.scss",
    );
    const reverseIndex = new WorkspaceReverseIndex();
    const tsxRange = { start: { line: 3, character: 10 }, end: { line: 3, character: 25 } };
    reverseIndex.record("file:///fake/src/App.tsx", [
      {
        uri: "file:///fake/src/App.tsx",
        range: tsxRange,
        scssModulePath: SCSS_PATH,
        match: { kind: "static", className: "button--primary" },
        expansion: "direct",
      },
    ]);
    const deps = makeBaseDeps({
      scssClassMapForPath: () => classMap,
      workspaceRoot: "/fake",
      reverseIndex,
    });
    const rawRange = classMap.get("button--primary")!.bemSuffix!.rawTokenRange;
    const result = handleRename(
      {
        textDocument: { uri: SCSS_URI },
        position: { line: rawRange.start.line, character: rawRange.start.character + 1 },
        newName: "button--tiny",
      },
      deps,
    );
    expect(result).not.toBeNull();
    const edits = (
      result as {
        changes: Record<
          string,
          Array<{
            range: { start: { character: number }; end: { character: number } };
            newText: string;
          }>
        >;
      }
    ).changes;
    // SCSS: only the `--primary` slice (9 chars from column +1) becomes `--tiny`.
    const scssEdits = edits[SCSS_URI]!;
    expect(scssEdits).toHaveLength(1);
    expect(scssEdits[0]!.newText).toBe("--tiny");
    expect(scssEdits[0]!.range.start.character).toBe(rawRange.start.character + 1);
    expect(scssEdits[0]!.range.end.character).toBe(rawRange.start.character + 1 + 9);
    // TSX: full `button--primary` → `button--tiny`.
    const tsxEdits = edits["file:///fake/src/App.tsx"]!;
    expect(tsxEdits).toHaveLength(1);
    expect(tsxEdits[0]!.newText).toBe("button--tiny");
  });

  it("rename `&__icon`: edits only the `__icon` slice", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const classMap = parseStyleModule(
      `.card {\n  &__icon { width: 16px; }\n}`,
      "/fake/src/Card.module.scss",
    );
    const deps = makeBaseDeps({
      scssClassMapForPath: () => classMap,
      workspaceRoot: "/fake",
    });
    const rawRange = classMap.get("card__icon")!.bemSuffix!.rawTokenRange;
    const result = handleRename(
      {
        textDocument: { uri: "file:///fake/src/Card.module.scss" },
        position: { line: rawRange.start.line, character: rawRange.start.character + 1 },
        newName: "card__glyph",
      },
      deps,
    );
    expect(result).not.toBeNull();
    const edits = (result as { changes: Record<string, Array<{ newText: string }>> }).changes;
    const scssEdits = edits["file:///fake/src/Card.module.scss"]!;
    expect(scssEdits[0]!.newText).toBe("__glyph");
  });

  it("double-nested `.card { &__icon { &--small {} } }` edits only innermost `--small`", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const classMap = parseStyleModule(
      `.card {\n  &__icon {\n    &--small { font-size: 12px; }\n  }\n}`,
      "/fake/src/Card.module.scss",
    );
    const deps = makeBaseDeps({
      scssClassMapForPath: () => classMap,
      workspaceRoot: "/fake",
    });
    const rawRange = classMap.get("card__icon--small")!.bemSuffix!.rawTokenRange;
    const result = handleRename(
      {
        textDocument: { uri: "file:///fake/src/Card.module.scss" },
        position: { line: rawRange.start.line, character: rawRange.start.character + 1 },
        newName: "card__icon--xs",
      },
      deps,
    );
    expect(result).not.toBeNull();
    const edits = (result as { changes: Record<string, Array<{ newText: string }>> }).changes;
    const scssEdits = edits["file:///fake/src/Card.module.scss"]!;
    expect(scssEdits).toHaveLength(1);
    expect(scssEdits[0]!.newText).toBe("--xs");
  });

  // Negative cases (12): new guards in Commit 4.
  it("rejects cross-parent rename `button--primary → banner--tiny`", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const classMap = parseStyleModule(
      `.button {\n  &--primary {}\n}`,
      "/fake/src/Button.module.scss",
    );
    const deps = makeBaseDeps({ scssClassMapForPath: () => classMap, workspaceRoot: "/fake" });
    const rawRange = classMap.get("button--primary")!.bemSuffix!.rawTokenRange;
    const result = handleRename(
      {
        textDocument: { uri: SCSS_URI },
        position: { line: rawRange.start.line, character: rawRange.start.character + 1 },
        newName: "banner--tiny",
      },
      deps,
    );
    expect(result).toBeNull();
  });

  it("rejects empty-suffix rename `button--primary → button`", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const classMap = parseStyleModule(`.button {\n  &--primary {}\n}`, "/f.module.scss");
    const deps = makeBaseDeps({ scssClassMapForPath: () => classMap, workspaceRoot: "/fake" });
    const rawRange = classMap.get("button--primary")!.bemSuffix!.rawTokenRange;
    const result = handleRename(
      {
        textDocument: { uri: SCSS_URI },
        position: { line: rawRange.start.line, character: rawRange.start.character + 1 },
        newName: "button",
      },
      deps,
    );
    expect(result).toBeNull();
  });

  it("rejects no-op rename `button--primary → button--primary`", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const classMap = parseStyleModule(`.button {\n  &--primary {}\n}`, "/f.module.scss");
    const deps = makeBaseDeps({ scssClassMapForPath: () => classMap, workspaceRoot: "/fake" });
    const rawRange = classMap.get("button--primary")!.bemSuffix!.rawTokenRange;
    const result = handleRename(
      {
        textDocument: { uri: SCSS_URI },
        position: { line: rawRange.start.line, character: rawRange.start.character + 1 },
        newName: "button--primary",
      },
      deps,
    );
    expect(result).toBeNull();
  });

  it("rejects interpolated rawToken (guard test — synthetic SelectorInfo)", () => {
    // Parser cannot produce this shape, but the guard is load-bearing
    // if a future parser change weakens interpolation filtering.
    const synthetic: SelectorInfo = {
      name: "btn--primary",
      range: { start: { line: 1, character: 2 }, end: { line: 1, character: 16 } },
      bemSuffix: {
        rawTokenRange: { start: { line: 1, character: 2 }, end: { line: 1, character: 14 } },
        rawToken: "&--#{$mod}",
        parentResolvedName: "btn",
      },
      isNested: true,
      fullSelector: ".btn--primary",
      declarations: "",
      ruleRange: { start: { line: 1, character: 0 }, end: { line: 1, character: 16 } },
    };
    const deps = makeBaseDeps({
      scssClassMapForPath: () => new Map([["btn--primary", synthetic]]) as ScssClassMap,
      workspaceRoot: "/fake",
    });
    const result = handlePrepareRename(
      { textDocument: { uri: SCSS_URI }, position: { line: 1, character: 3 } },
      deps,
    );
    expect(result).toBeNull();
  });

  it("rejects non-bare parent `.card:hover { &--primary {} }`", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const classMap = parseStyleModule(`.card:hover {\n  &--primary {}\n}`, "/f.module.scss");
    // `card--primary` never exists because extractClassNames strips
    // `:hover--primary` greedily. Any cursor on line 1 falls through.
    expect(classMap.has("card--primary")).toBe(false);
  });

  it("rejects grouped parent `.a, .b { &--c {} }`", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const classMap = parseStyleModule(`.a, .b {\n  &--c {}\n}`, "/f.module.scss");
    const info = classMap.get("a--c") ?? classMap.get("b--c");
    expect(info).toBeDefined();
    // bemSuffix undefined because parentCtx.isGrouped === true
    expect(info!.bemSuffix).toBeUndefined();
    // prepareRename must refuse
    const deps = makeBaseDeps({ scssClassMapForPath: () => classMap, workspaceRoot: "/fake" });
    const result = handlePrepareRename(
      { textDocument: { uri: SCSS_URI }, position: { line: 1, character: 3 } },
      deps,
    );
    expect(result).toBeNull();
  });

  it("rejects grouped-nested child `.btn { &--a, &--b {} }`", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const classMap = parseStyleModule(`.btn {\n  &--a, &--b {}\n}`, "/f.module.scss");
    const a = classMap.get("btn--a");
    expect(a).toBeDefined();
    expect(a!.bemSuffix).toBeUndefined();
    const deps = makeBaseDeps({ scssClassMapForPath: () => classMap, workspaceRoot: "/fake" });
    const result = handlePrepareRename(
      { textDocument: { uri: SCSS_URI }, position: { line: 1, character: 3 } },
      deps,
    );
    expect(result).toBeNull();
  });

  it("rejects multi-`&` `.btn { & + &--x {} }`", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const classMap = parseStyleModule(`.btn {\n  & + &--x {}\n}`, "/f.module.scss");
    const info = classMap.get("btn--x");
    if (info !== undefined) {
      expect(info.bemSuffix).toBeUndefined();
      const deps = makeBaseDeps({ scssClassMapForPath: () => classMap, workspaceRoot: "/fake" });
      const result = handlePrepareRename(
        { textDocument: { uri: SCSS_URI }, position: { line: 1, character: 3 } },
        deps,
      );
      expect(result).toBeNull();
    }
  });

  it("rejects compound `.button { &.active {} }` (active entry has no trio)", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const classMap = parseStyleModule(`.button {\n  &.active {}\n}`, "/f.module.scss");
    const active = classMap.get("active")!;
    expect(active.isNested).toBe(true);
    expect(active.bemSuffix).toBeUndefined();
    const deps = makeBaseDeps({ scssClassMapForPath: () => classMap, workspaceRoot: "/fake" });
    // Cursor on `&.active` → selectorInfo is the `active` entry with
    // trio undefined → reject via nested-trio guard.
    const result = handlePrepareRename(
      { textDocument: { uri: SCSS_URI }, position: { line: 1, character: 3 } },
      deps,
    );
    expect(result).toBeNull();
  });

  it("rejects invalid newName (empty string)", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const classMap = parseStyleModule(`.button {\n  &--primary {}\n}`, "/f.module.scss");
    const deps = makeBaseDeps({ scssClassMapForPath: () => classMap, workspaceRoot: "/fake" });
    const rawRange = classMap.get("button--primary")!.bemSuffix!.rawTokenRange;
    const result = handleRename(
      {
        textDocument: { uri: SCSS_URI },
        position: { line: rawRange.start.line, character: rawRange.start.character + 1 },
        newName: "",
      },
      deps,
    );
    expect(result).toBeNull();
  });

  it("rejects invalid newName (numeric start)", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const classMap = parseStyleModule(`.button {\n  &--primary {}\n}`, "/f.module.scss");
    const deps = makeBaseDeps({ scssClassMapForPath: () => classMap, workspaceRoot: "/fake" });
    const rawRange = classMap.get("button--primary")!.bemSuffix!.rawTokenRange;
    const result = handleRename(
      {
        textDocument: { uri: SCSS_URI },
        position: { line: rawRange.start.line, character: rawRange.start.character + 1 },
        newName: "123xyz",
      },
      deps,
    );
    expect(result).toBeNull();
  });

  it("Wave 1 Bug 3.1 regression: nested `&--primary` + template `cx(\\`button--${x}\\`)` still rejects via expanded-sites", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const classMap = parseStyleModule(
      `.button {\n  &--primary {}\n}`,
      "/fake/src/Button.module.scss",
    );
    const reverseIndex = new WorkspaceReverseIndex();
    // Simulate a template-literal call site that expanded to
    // include `button--primary`. Rename must still reject.
    reverseIndex.record("file:///fake/src/App.tsx", [
      {
        uri: "file:///fake/src/App.tsx",
        range: { start: { line: 5, character: 10 }, end: { line: 5, character: 30 } },
        scssModulePath: SCSS_PATH,
        match: { kind: "template", staticPrefix: "button--" },
        expansion: "direct",
      },
      {
        uri: "file:///fake/src/App.tsx",
        range: { start: { line: 5, character: 10 }, end: { line: 5, character: 30 } },
        scssModulePath: SCSS_PATH,
        match: { kind: "static", className: "button--primary" },
        expansion: "expanded",
      },
    ]);
    const deps = makeBaseDeps({
      scssClassMapForPath: () => classMap,
      workspaceRoot: "/fake",
      reverseIndex,
    });
    const rawRange = classMap.get("button--primary")!.bemSuffix!.rawTokenRange;
    const result = handlePrepareRename(
      {
        textDocument: { uri: SCSS_URI },
        position: { line: rawRange.start.line, character: rawRange.start.character + 1 },
      },
      deps,
    );
    expect(result).toBeNull();
  });
});
