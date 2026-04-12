import { describe, expect, it, vi } from "vitest";
import type { ClassRef, CxBinding, ScssClassMap, SelectorInfo } from "@css-module-explainer/shared";
import type ts from "typescript";
import { buildStyleDocumentFromClassMap } from "../../../server/src/core/hir/builders/style-adapter";
import { SourceFileCache } from "../../../server/src/core/ts/source-file-cache";
import { DocumentAnalysisCache } from "../../../server/src/core/indexing/document-analysis-cache";
import { WorkspaceSemanticWorkspaceReferenceIndex } from "../../../server/src/core/semantic/workspace-reference-index";
import type { CursorParams, ProviderDeps } from "../../../server/src/providers/cursor-dispatch";
import { handlePrepareRename, handleRename } from "../../../server/src/providers/rename";
import { findSelectorAtCursor } from "../../../server/src/providers/references";
import { expandClassMapWithTransform } from "../../../server/src/core/scss/classname-transform";
import { DEFAULT_SETTINGS } from "../../../server/src/settings";
import type { Settings } from "../../../server/src/settings";
import {
  EMPTY_ALIAS_RESOLVER,
  infoAtLine as info,
  makeBaseDeps,
} from "../../_fixtures/test-helpers";

const SCSS_PATH = "/fake/src/Button.module.scss";
const SCSS_URI = "file:///fake/src/Button.module.scss";

function semanticSite(args: {
  uri: string;
  canonicalName: string;
  className?: string;
  line: number;
  start?: number;
  end?: number;
  certainty?: "exact" | "inferred" | "possible";
  reason?: "literal" | "styleAccess" | "templatePrefix" | "typeUnion";
  origin?: "cxCall" | "styleAccess";
}) {
  const certainty = args.certainty ?? "exact";
  const start = args.start ?? 10;
  return {
    refId: `ref:${args.uri}:${args.line}:${start}`,
    selectorId: `selector:${SCSS_PATH}:${args.canonicalName}`,
    filePath: args.uri.replace("file://", ""),
    uri: args.uri,
    range: {
      start: { line: args.line, character: start },
      end: { line: args.line, character: args.end ?? start + args.canonicalName.length },
    },
    origin: args.origin ?? "cxCall",
    scssModulePath: SCSS_PATH,
    selectorFilePath: SCSS_PATH,
    canonicalName: args.canonicalName,
    className: args.className ?? args.canonicalName,
    certainty,
    reason: args.reason ?? "literal",
    expansion: certainty === "exact" ? "direct" : "expanded",
  } as const;
}

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
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///fake/src/App.tsx", [
      semanticSite({
        uri: "file:///fake/src/App.tsx",
        canonicalName: "indicator",
        line: 10,
      }),
    ]);
    semanticReferenceIndex.record("file:///fake/src/Other.tsx", [
      semanticSite({
        uri: "file:///fake/src/Other.tsx",
        canonicalName: "indicator",
        line: 20,
      }),
    ]);
    const result = handleRename(
      {
        textDocument: { uri: SCSS_URI },
        position: { line: 1, character: 3 },
        newName: "status",
      },
      makeDeps({ semanticReferenceIndex }),
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
    fileExists: () => true,
    aliasResolver: EMPTY_ALIAS_RESOLVER,
    scanCxImports: (sourceFile) => ({
      stylesBindings: new Map([
        ["styles", { kind: "resolved" as const, absolutePath: BINDING.scssModulePath }],
      ]),
      bindings: [
        {
          ...BINDING,
          scope: {
            startLine: 0,
            endLine: sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line,
          },
        },
      ],
    }),
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
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///fake/src/App.tsx", [
      semanticSite({
        uri: "file:///fake/src/App.tsx",
        canonicalName: "indicator",
        line: 3,
        start: 14,
        end: 23,
      }),
    ]);
    semanticReferenceIndex.record("file:///fake/src/Other.tsx", [
      semanticSite({
        uri: "file:///fake/src/Other.tsx",
        canonicalName: "indicator",
        line: 20,
      }),
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
      makeTsxDeps({ semanticReferenceIndex }),
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

// Rename must not corrupt template/variable reverse-index sites.
// When a rename rewrites a class whose reverse index also contains
// "expanded" template/variable entries at the same range, those
// synthesized entries must be skipped — rewriting them would
// destroy the dynamic expression source.
describe("rename template corruption guard", () => {
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

  function buildTemplateSemanticIndex(): WorkspaceSemanticWorkspaceReferenceIndex {
    const idx = new WorkspaceSemanticWorkspaceReferenceIndex();
    idx.record(TEMPLATE_URI, [
      semanticSite({
        uri: TEMPLATE_URI,
        canonicalName: "btn-small",
        className: "btn-small",
        line: TEMPLATE_RANGE.start.line,
        start: TEMPLATE_RANGE.start.character,
        end: TEMPLATE_RANGE.end.character,
        certainty: "inferred",
        reason: "templatePrefix",
      }),
      semanticSite({
        uri: TEMPLATE_URI,
        canonicalName: "btn-large",
        className: "btn-large",
        line: TEMPLATE_RANGE.start.line,
        start: TEMPLATE_RANGE.start.character,
        end: TEMPLATE_RANGE.end.character,
        certainty: "inferred",
        reason: "templatePrefix",
      }),
    ]);
    return idx;
  }

  function btnScssDeps(overrides: Partial<ProviderDeps> = {}): ProviderDeps {
    return makeBaseDeps({
      scssClassMapForPath: () =>
        new Map([
          ["btn-small", info("btn-small", 1)],
          ["btn-large", info("btn-large", 3)],
        ]) as ScssClassMap,
      workspaceRoot: "/fake",
      ...overrides,
    });
  }

  it("rename template-literal class does NOT rewrite the template range", () => {
    const semanticReferenceIndex = buildTemplateSemanticIndex();
    const result = handleRename(
      {
        textDocument: { uri: SCSS_URI },
        position: { line: 1, character: 3 },
        newName: "btn-tiny",
      },
      btnScssDeps({ semanticReferenceIndex }),
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

  it("SCSS-side prepareRename rejects class with template/variable references", () => {
    const semanticReferenceIndex = buildTemplateSemanticIndex();
    const result = handlePrepareRename(
      {
        textDocument: { uri: SCSS_URI },
        position: { line: 1, character: 3 },
      },
      btnScssDeps({ semanticReferenceIndex }),
    );
    // Cursor is on `.btn-small`, which has an inferred semantic
    // site from the template expansion. prepareRename must refuse.
    expect(result).toBeNull();
  });

  it("SCSS-side prepareRename rejects class with semantic inferred references", () => {
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///fake/src/App.tsx", [
      semanticSite({
        uri: "file:///fake/src/App.tsx",
        canonicalName: "btn-small",
        line: 5,
        start: 10,
        end: 30,
        certainty: "inferred",
        reason: "templatePrefix",
      }),
    ]);
    const result = handlePrepareRename(
      {
        textDocument: { uri: SCSS_URI },
        position: { line: 1, character: 3 },
      },
      btnScssDeps({ semanticReferenceIndex }),
    );
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

    // Cursor on the nested `&--primary` — accepted via BEM suffix
    // rename. Placeholder is the resolved class name
    // `"button--primary"`; range covers the `&--primary` slice
    // (10 chars) on its line.
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
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///fake/src/App.tsx", [
      semanticSite({
        uri: "file:///fake/src/App.tsx",
        canonicalName: "button--primary",
        className: "button--primary",
        line: 3,
        start: 10,
        end: 25,
      }),
    ]);
    const deps = makeBaseDeps({
      scssClassMapForPath: () => classMap,
      workspaceRoot: "/fake",
      semanticReferenceIndex,
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
    const entry = classMap.get("a--c") ?? classMap.get("b--c");
    expect(entry).toBeDefined();
    // bemSuffix undefined because parentCtx.isGrouped === true
    expect(entry!.bemSuffix).toBeUndefined();
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
    const entry = classMap.get("btn--x");
    if (entry !== undefined) {
      expect(entry.bemSuffix).toBeUndefined();
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

  it("regression: nested `&--primary` + template `cx(\\`button--${x}\\`)` still rejects via expanded-sites", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const classMap = parseStyleModule(
      `.button {\n  &--primary {}\n}`,
      "/fake/src/Button.module.scss",
    );
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///fake/src/App.tsx", [
      semanticSite({
        uri: "file:///fake/src/App.tsx",
        canonicalName: "button--primary",
        className: "button--primary",
        line: 5,
        start: 10,
        end: 30,
        certainty: "inferred",
        reason: "templatePrefix",
      }),
    ]);
    const deps = makeBaseDeps({
      scssClassMapForPath: () => classMap,
      workspaceRoot: "/fake",
      semanticReferenceIndex,
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

/**
 * Alias-first iteration order. Production `expandClassMapWithTransform`
 * puts originals before aliases, which makes SCSS-cursor always hit
 * the original. To exercise the alias-selectorInfo code path from
 * the SCSS side, we flip the insertion order. The code under test
 * must be robust regardless of iteration order — and this helper
 * forces the alias branch.
 */
const camelOf = (name: string): string =>
  name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((p, i) =>
      i === 0 ? p.charAt(0).toLowerCase() + p.slice(1) : p.charAt(0).toUpperCase() + p.slice(1),
    )
    .join("");

function aliasFirstCamelCaseMap(base: ScssClassMap): ScssClassMap {
  const expanded = new Map<string, SelectorInfo>();
  for (const [name, entry] of base) {
    const alias = camelOf(name);
    if (alias !== name && !expanded.has(alias)) {
      expanded.set(alias, { ...entry, name: alias, originalName: name });
    }
  }
  for (const [name, entry] of base) {
    expanded.set(name, entry);
  }
  return expanded;
}

function withTransformMode(mode: Settings["scss"]["classnameTransform"]): Settings {
  return {
    ...DEFAULT_SETTINGS,
    scss: { ...DEFAULT_SETTINGS.scss, classnameTransform: mode },
  };
}

describe("classnameTransform alias-aware rename", () => {
  it("camelCase: alias cursor rewrites SCSS via original entry's range", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const base = parseStyleModule(`.btn-primary { color: red; }`, SCSS_PATH);
    const classMap = aliasFirstCamelCaseMap(base);
    // sanity: alias iterates first
    const firstKey = classMap.keys().next().value;
    expect(firstKey).toBe("btnPrimary");
    const original = base.get("btn-primary")!;

    const deps = makeBaseDeps({
      scssClassMapForPath: () => classMap,
      workspaceRoot: "/fake",
      settings: withTransformMode("camelCase"),
    });
    const result = handleRename(
      {
        textDocument: { uri: SCSS_URI },
        position: {
          line: original.range.start.line,
          character: original.range.start.character + 1,
        },
        newName: "btn-hero",
      },
      deps,
    );
    expect(result).not.toBeNull();
    const scssEdits = result!.changes![SCSS_URI]!;
    expect(scssEdits).toHaveLength(1);
    expect(scssEdits[0]!.newText).toBe("btn-hero");
    // Edit range equals the ORIGINAL entry's range, even though the
    // cursor resolved to the alias via alias-first iteration.
    expect(scssEdits[0]!.range).toEqual({
      start: { line: original.range.start.line, character: original.range.start.character },
      end: { line: original.range.end.line, character: original.range.end.character },
    });
  });

  it("camelCase: alias cursor on deep-nested BEM edits only the suffix slice", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const base = parseStyleModule(`.btn-primary {\n  &--xl {}\n}`, SCSS_PATH);
    const classMap = aliasFirstCamelCaseMap(base);
    // sanity: alias entries exist
    expect(classMap.has("btnPrimaryXl")).toBe(true);
    expect(classMap.get("btnPrimaryXl")!.originalName).toBe("btn-primary--xl");
    const originalNested = base.get("btn-primary--xl")!;
    const rawRange = originalNested.bemSuffix!.rawTokenRange;

    const deps = makeBaseDeps({
      scssClassMapForPath: () => classMap,
      workspaceRoot: "/fake",
      settings: withTransformMode("camelCase"),
    });
    const result = handleRename(
      {
        textDocument: { uri: SCSS_URI },
        position: { line: rawRange.start.line, character: rawRange.start.character + 1 },
        newName: "btn-primary--huge",
      },
      deps,
    );
    expect(result).not.toBeNull();
    const scssEdits = result!.changes![SCSS_URI]!;
    expect(scssEdits).toHaveLength(1);
    // Slice edit: `--xl` at offset+1 replaced by `--huge`. Parent
    // stays untouched; the edit length is the original suffix length.
    expect(scssEdits[0]!.newText).toBe("--huge");
    expect(scssEdits[0]!.range.start).toEqual({
      line: rawRange.start.line,
      character: rawRange.start.character + 1,
    });
    expect(scssEdits[0]!.range.end).toEqual({
      line: rawRange.start.line,
      character: rawRange.start.character + 1 + "--xl".length,
    });
  });

  it("camelCase: original-name cursor (non-alias path) edits same range", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const base = parseStyleModule(`.btn-primary { color: red; }`, SCSS_PATH);
    // Production expansion (original-first) — findSelectorAtCursor
    // returns the non-alias entry.
    const classMap = expandClassMapWithTransform(base, "camelCase");
    const original = base.get("btn-primary")!;

    const deps = makeBaseDeps({
      scssClassMapForPath: () => classMap,
      workspaceRoot: "/fake",
      settings: withTransformMode("camelCase"),
    });
    const result = handleRename(
      {
        textDocument: { uri: SCSS_URI },
        position: {
          line: original.range.start.line,
          character: original.range.start.character + 1,
        },
        newName: "btn-hero",
      },
      deps,
    );
    expect(result).not.toBeNull();
    const scssEdits = result!.changes![SCSS_URI]!;
    expect(scssEdits).toHaveLength(1);
    expect(scssEdits[0]!.newText).toBe("btn-hero");
    expect(scssEdits[0]!.range).toEqual({
      start: { line: original.range.start.line, character: original.range.start.character },
      end: { line: original.range.end.line, character: original.range.end.character },
    });
  });

  it("camelCaseOnly: alias rename is rejected at prepareRename", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const base = parseStyleModule(`.btn-primary { color: red; }`, SCSS_PATH);
    // camelCaseOnly drops the original; only `btnPrimary` alias remains.
    const classMap = expandClassMapWithTransform(base, "camelCaseOnly");
    expect(classMap.has("btn-primary")).toBe(false);
    expect(classMap.get("btnPrimary")!.originalName).toBe("btn-primary");
    const alias = classMap.get("btnPrimary")!;

    const deps = makeBaseDeps({
      scssClassMapForPath: () => classMap,
      workspaceRoot: "/fake",
      settings: withTransformMode("camelCaseOnly"),
    });
    const result = handlePrepareRename(
      {
        textDocument: { uri: SCSS_URI },
        position: {
          line: alias.range.start.line,
          character: alias.range.start.character + 1,
        },
      },
      deps,
    );
    expect(result).toBeNull();
  });

  it("dashesOnly: alias rename is rejected at prepareRename", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const base = parseStyleModule(`.btn-primary { color: red; }`, SCSS_PATH);
    const classMap = expandClassMapWithTransform(base, "dashesOnly");
    expect(classMap.get("btnPrimary")!.originalName).toBe("btn-primary");
    const alias = classMap.get("btnPrimary")!;

    const deps = makeBaseDeps({
      scssClassMapForPath: () => classMap,
      workspaceRoot: "/fake",
      settings: withTransformMode("dashesOnly"),
    });
    const result = handlePrepareRename(
      {
        textDocument: { uri: SCSS_URI },
        position: {
          line: alias.range.start.line,
          character: alias.range.start.character + 1,
        },
      },
      deps,
    );
    expect(result).toBeNull();
  });

  it("camelCase: canonical-form and alias-form sites both rewrite with per-site format", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const base = parseStyleModule(`.btn-primary { color: red; }`, SCSS_PATH);
    const classMap = expandClassMapWithTransform(base, "camelCase");
    const original = base.get("btn-primary")!;

    // Two real-world access patterns against the same SCSS class:
    //   - `cx('btn-primary')` in App.tsx — canonical form
    //   - `styles.btnPrimary`  in Other.tsx — alias form
    // Both access forms are keyed under the canonical selector.
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///fake/src/App.tsx", [
      semanticSite({
        uri: "file:///fake/src/App.tsx",
        canonicalName: "btn-primary",
        className: "btn-primary",
        line: 10,
      }),
    ]);
    semanticReferenceIndex.record("file:///fake/src/Other.tsx", [
      semanticSite({
        uri: "file:///fake/src/Other.tsx",
        canonicalName: "btn-primary",
        className: "btnPrimary",
        line: 20,
        reason: "styleAccess",
        origin: "styleAccess",
      }),
    ]);

    const deps = makeBaseDeps({
      scssClassMapForPath: () => classMap,
      workspaceRoot: "/fake",
      semanticReferenceIndex,
      settings: withTransformMode("camelCase"),
    });
    const result = handleRename(
      {
        textDocument: { uri: SCSS_URI },
        position: {
          line: original.range.start.line,
          character: original.range.start.character + 1,
        },
        newName: "btn-hero",
      },
      deps,
    );
    expect(result).not.toBeNull();
    const changes = result!.changes!;
    // Canonical-form site writes the raw dashed name.
    expect(changes["file:///fake/src/App.tsx"]).toHaveLength(1);
    expect(changes["file:///fake/src/App.tsx"]![0]!.newText).toBe("btn-hero");
    // Alias-form site writes the camelCase form of the new name so
    // `styles.btnPrimary` becomes `styles.btnHero`, not the invalid
    // `styles.btn-hero`.
    expect(changes["file:///fake/src/Other.tsx"]).toHaveLength(1);
    expect(changes["file:///fake/src/Other.tsx"]![0]!.newText).toBe("btnHero");
  });

  it("camelCase: semantic direct sites rewrite with per-site format", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const base = parseStyleModule(`.btn-primary { color: red; }`, SCSS_PATH);
    const classMap = expandClassMapWithTransform(base, "camelCase");
    const original = base.get("btn-primary")!;

    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///fake/src/App.tsx", [
      semanticSite({
        uri: "file:///fake/src/App.tsx",
        canonicalName: "btn-primary",
        className: "btn-primary",
        line: 10,
      }),
    ]);
    semanticReferenceIndex.record("file:///fake/src/Other.tsx", [
      semanticSite({
        uri: "file:///fake/src/Other.tsx",
        canonicalName: "btn-primary",
        className: "btnPrimary",
        line: 20,
        reason: "styleAccess",
        origin: "styleAccess",
      }),
    ]);

    const deps = makeBaseDeps({
      scssClassMapForPath: () => classMap,
      workspaceRoot: "/fake",
      semanticReferenceIndex,
      settings: withTransformMode("camelCase"),
    });
    const result = handleRename(
      {
        textDocument: { uri: SCSS_URI },
        position: {
          line: original.range.start.line,
          character: original.range.start.character + 1,
        },
        newName: "btn-hero",
      },
      deps,
    );
    expect(result).not.toBeNull();
    const changes = result!.changes!;
    expect(changes["file:///fake/src/App.tsx"]).toHaveLength(1);
    expect(changes["file:///fake/src/App.tsx"]![0]!.newText).toBe("btn-hero");
    expect(changes["file:///fake/src/Other.tsx"]).toHaveLength(1);
    expect(changes["file:///fake/src/Other.tsx"]![0]!.newText).toBe("btnHero");
  });

  it("camelCase: SCSS cursor on original still finds alias-form TSX sites via canonical key", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const base = parseStyleModule(`.btn-primary { color: red; }`, SCSS_PATH);
    const classMap = expandClassMapWithTransform(base, "camelCase");
    const original = base.get("btn-primary")!;

    // Only an alias-form TSX site exists — no direct `cx('btn-primary')`.
    // SCSS cursor rename on the original must still rewrite the
    // alias access because the semantic index keys it under the
    // canonical selector.
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///fake/src/App.tsx", [
      semanticSite({
        uri: "file:///fake/src/App.tsx",
        canonicalName: "btn-primary",
        className: "btnPrimary",
        line: 15,
        reason: "styleAccess",
        origin: "styleAccess",
      }),
    ]);

    const deps = makeBaseDeps({
      scssClassMapForPath: () => classMap,
      workspaceRoot: "/fake",
      semanticReferenceIndex,
      settings: withTransformMode("camelCase"),
    });
    const result = handleRename(
      {
        textDocument: { uri: SCSS_URI },
        position: {
          line: original.range.start.line,
          character: original.range.start.character + 1,
        },
        newName: "btn-hero",
      },
      deps,
    );
    expect(result).not.toBeNull();
    const tsxEdits = result!.changes!["file:///fake/src/App.tsx"]!;
    expect(tsxEdits).toHaveLength(1);
    expect(tsxEdits[0]!.newText).toBe("btnHero");
  });

  it("camelCase: SCSS cursor on original-first expansion returns the non-alias entry", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const base = parseStyleModule(`.btn-primary { color: red; }`, SCSS_PATH);
    const classMap = expandClassMapWithTransform(base, "camelCase");
    // Both keys present.
    expect(classMap.has("btn-primary")).toBe(true);
    expect(classMap.has("btnPrimary")).toBe(true);
    const original = base.get("btn-primary")!;

    const hit = findSelectorAtCursor(
      buildStyleDocumentFromClassMap(SCSS_PATH, classMap),
      original.range.start.line,
      original.range.start.character + 1,
    );
    expect(hit).not.toBeNull();
    // Locks in that cursoring through the SCSS source still lands
    // on the original entry, not the alias copy — regression guard
    // against a future iteration-order change.
    expect(hit!.name).toBe("btn-primary");
    expect(hit!.originalName).toBeUndefined();
  });

  it("regression: expanded site on original key rejects rename via alias cursor", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const base = parseStyleModule(`.btn-primary { color: red; }`, SCSS_PATH);
    const classMap = aliasFirstCamelCaseMap(base);
    const original = base.get("btn-primary")!;

    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///fake/src/App.tsx", [
      semanticSite({
        uri: "file:///fake/src/App.tsx",
        canonicalName: "btn-primary",
        className: "btn-primary",
        line: 5,
        start: 10,
        end: 30,
        certainty: "inferred",
        reason: "templatePrefix",
      }),
    ]);

    const deps = makeBaseDeps({
      scssClassMapForPath: () => classMap,
      workspaceRoot: "/fake",
      semanticReferenceIndex,
      settings: withTransformMode("camelCase"),
    });
    // Cursor hits the alias first (alias-first iteration). Without
    // the union, the single-key check against `btnPrimary` would
    // miss the expanded site keyed on `btn-primary` and allow the
    // rename — rewriting the template and destroying the source.
    const result = handlePrepareRename(
      {
        textDocument: { uri: SCSS_URI },
        position: {
          line: original.range.start.line,
          character: original.range.start.character + 1,
        },
      },
      deps,
    );
    expect(result).toBeNull();
  });

  it("regression: semantic expanded site on original key rejects rename via alias cursor", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const base = parseStyleModule(`.btn-primary { color: red; }`, SCSS_PATH);
    const classMap = aliasFirstCamelCaseMap(base);
    const original = base.get("btn-primary")!;

    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///fake/src/App.tsx", [
      semanticSite({
        uri: "file:///fake/src/App.tsx",
        canonicalName: "btn-primary",
        className: "btn-primary",
        line: 5,
        start: 10,
        end: 30,
        certainty: "inferred",
        reason: "templatePrefix",
      }),
    ]);

    const deps = makeBaseDeps({
      scssClassMapForPath: () => classMap,
      workspaceRoot: "/fake",
      semanticReferenceIndex,
      settings: withTransformMode("camelCase"),
    });
    const result = handlePrepareRename(
      {
        textDocument: { uri: SCSS_URI },
        position: {
          line: original.range.start.line,
          character: original.range.start.character + 1,
        },
      },
      deps,
    );
    expect(result).toBeNull();
  });
});
