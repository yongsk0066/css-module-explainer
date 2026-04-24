import { describe, expect, it, vi } from "vitest";
import type { CxBinding } from "../../../server/engine-core-ts/src/core/cx/cx-types";
import { findSelectorAtCursor } from "../../../server/engine-core-ts/src/core/query";
import { SourceFileCache } from "../../../server/engine-core-ts/src/core/ts/source-file-cache";
import { DocumentAnalysisCache } from "../../../server/engine-core-ts/src/core/indexing/document-analysis-cache";
import { WorkspaceSemanticWorkspaceReferenceIndex } from "../../../server/engine-core-ts/src/core/semantic/workspace-reference-index";
import type {
  CursorParams,
  ProviderDeps,
} from "../../../server/lsp-server/src/providers/cursor-dispatch";
import { handlePrepareRename, handleRename } from "../../../server/lsp-server/src/providers/rename";
import { DEFAULT_SETTINGS } from "../../../server/engine-core-ts/src/settings";
import type { Settings } from "../../../server/engine-core-ts/src/settings";
import {
  cursorFixture,
  scenario,
  targetFixture,
  workspace,
  type CmeWorkspace,
  type Range,
} from "../../../packages/vitest-cme/src";
import {
  EMPTY_ALIAS_RESOLVER,
  buildTestClassExpressions,
  infoAtLine as info,
  makeBaseDeps,
} from "../../_fixtures/test-helpers";
import {
  buildStyleDocumentFromSelectorMap,
  expandSelectorMapWithTransform,
  parseStyleSelectorMap,
} from "../../_fixtures/style-documents";

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
  expansion?: "direct" | "expanded";
}) {
  const certainty = args.certainty ?? "exact";
  const start = args.start ?? 10;
  const expansion = args.expansion ?? (certainty === "exact" ? "direct" : "expanded");
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
    expansion,
  } as const;
}

function makeDeps(overrides: Partial<ProviderDeps> = {}): ProviderDeps {
  return makeBaseDeps({
    selectorMapForPath: () =>
      new Map([
        ["indicator", info("indicator", 1)],
        ["active", info("active", 3)],
      ]),
    workspaceRoot: "/fake",
    ...overrides,
  });
}

function expectPrepareRenameBlocked(
  run: () => ReturnType<typeof handlePrepareRename>,
  message: string,
): void {
  expect(run).toThrow(message);
}

function styleWorkspace(filePath: string, content: string): CmeWorkspace {
  return workspace({ [filePath]: content });
}

function styleClassMap(fixture: CmeWorkspace, filePath: string) {
  return parseStyleSelectorMap(fixture.file(filePath).content, filePath);
}

function stylePositionParams(
  fixture: CmeWorkspace,
  uri: string,
  markerName = "cursor",
  filePath?: string,
) {
  const target = targetFixture({ workspace: fixture, markerName, filePath });
  return {
    textDocument: { uri },
    position: target.position,
  };
}

function styleRenameParams(
  fixture: CmeWorkspace,
  uri: string,
  newName: string,
  markerName = "cursor",
  filePath?: string,
) {
  return {
    ...stylePositionParams(fixture, uri, markerName, filePath),
    newName,
  };
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

  it("rejects nested child selectors that parse as standalone classes", () => {
    const styleDocument = buildStyleDocumentFromSelectorMap(
      SCSS_PATH,
      expandSelectorMapWithTransform(
        parseStyleSelectorMap(
          `
.button {
  .child {
    color: red;
  }
}
`,
          SCSS_PATH,
        ),
        "asIs",
      ),
    );
    expect(() =>
      handlePrepareRename(
        {
          textDocument: { uri: SCSS_URI },
          position: { line: 2, character: 4 },
        },
        makeDeps({ styleDocumentForPath: () => styleDocument }),
      ),
    ).toThrow("Only flat selectors and safe BEM suffix selectors can be renamed.");
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
      selectorMapForPath: () => {
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
      selectorMapForPath: () => {
        throw new Error("boom");
      },
      logError,
    }),
  );
  expect(result).toBeNull();
  expect(logError).toHaveBeenCalledTimes(1);
});

// ── TS/TSX side tests ──

const TSX_PATH = "/fake/src/App.tsx";
const TSX_URI = "file:///fake/src/App.tsx";
const TSX_WORKSPACE = workspace({
  [TSX_PATH]: `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
const a = cx('/*<class>*/ind/*|*/icator/*</class>*/');
`,
});
const TSX_CONTENT = TSX_WORKSPACE.file(TSX_PATH).content;
const TSX_CLASS_RANGE = TSX_WORKSPACE.range("class", TSX_PATH).range;

const BINDING: CxBinding = {
  cxVarName: "cx",
  stylesVarName: "styles",
  scssModulePath: "/fake/src/Button.module.scss",
  classNamesImportName: "classNames",
  bindingRange: {
    start: { line: 2, character: 6 },
    end: { line: 2, character: 8 },
  },
};

function makeTsxDeps(
  overrides: Partial<ProviderDeps> = {},
  expressionRange: Range = TSX_CLASS_RANGE,
): ProviderDeps {
  const sourceFileCache = new SourceFileCache({ max: 10 });
  const analysisCache = new DocumentAnalysisCache({
    sourceFileCache,
    fileExists: () => true,
    aliasResolver: EMPTY_ALIAS_RESOLVER,
    scanCxImports: (_sourceFile) => ({
      stylesBindings: new Map([
        ["styles", { kind: "resolved" as const, absolutePath: BINDING.scssModulePath }],
      ]),
      bindings: [
        {
          ...BINDING,
          bindingRange: {
            start: { line: 2, character: 6 },
            end: { line: 2, character: 8 },
          },
        },
      ],
    }),
    parseClassExpressions: (_sf, bindings) =>
      buildTestClassExpressions({
        filePath: TSX_PATH,
        bindings,
        expressions:
          bindings.length === 0
            ? []
            : [
                {
                  kind: "literal",
                  origin: "cxCall",
                  className: "indicator",
                  range: expressionRange,
                  scssModulePath: bindings[0]!.scssModulePath,
                },
              ],
      }),
    max: 10,
  });
  return makeBaseDeps({
    analysisCache,
    selectorMapForPath: () => new Map([["indicator", info("indicator", 1)]]),
    workspaceRoot: "/fake",
    ...overrides,
  });
}

describe("handlePrepareRename from TS/TSX", () => {
  it("returns range and placeholder for cursor on cx('indicator')", async () => {
    const spec = scenario({
      name: "prepareRename/static-cx-literal",
      workspace: TSX_WORKSPACE,
      actions: {
        prepareRename: ({ workspace: testWorkspace, target }) => {
          const cursor = cursorFixture({
            workspace: testWorkspace,
            filePath: TSX_PATH,
            documentUri: TSX_URI,
            markerName: target.name,
            version: 1,
          });
          return handlePrepareRename(
            {
              textDocument: { uri: TSX_URI },
              position: cursor.position,
            },
            makeTsxDeps({}, testWorkspace.range("class", TSX_PATH).range),
            cursor,
          );
        },
      },
    });

    const result = await spec.prepareRename("cursor", TSX_PATH);
    expect(result).not.toBeNull();
    expect(result!.placeholder).toBe("indicator");
    expect(result!.range).toEqual(TSX_CLASS_RANGE);
  });

  it("throws a message when the cursor is on a dynamic class expression", () => {
    const sourceFileCache = new SourceFileCache({ max: 10 });
    const analysisCache = new DocumentAnalysisCache({
      sourceFileCache,
      fileExists: () => true,
      aliasResolver: EMPTY_ALIAS_RESOLVER,
      scanCxImports: (_sourceFile) => ({
        stylesBindings: new Map([
          ["styles", { kind: "resolved" as const, absolutePath: BINDING.scssModulePath }],
        ]),
        bindings: [
          {
            ...BINDING,
            bindingRange: {
              start: { line: 2, character: 6 },
              end: { line: 2, character: 8 },
            },
          },
        ],
      }),
      parseClassExpressions: (_sf, bindings) =>
        buildTestClassExpressions({
          filePath: "/fake/src/App.tsx",
          bindings,
          expressions: [
            {
              kind: "symbolRef",
              origin: "cxCall",
              rawReference: "size",
              range: {
                start: { line: 3, character: 13 },
                end: { line: 3, character: 17 },
              },
              scssModulePath: bindings[0]!.scssModulePath,
            },
          ],
        }),
      max: 10,
    });
    const deps = makeBaseDeps({
      analysisCache,
      selectorMapForPath: () => new Map([["indicator", info("indicator")]]),
      workspaceRoot: "/fake",
    });
    const cursorParams: CursorParams = {
      documentUri: "file:///fake/src/App.tsx",
      content: TSX_CONTENT.replace("cx('indicator')", "cx(size)"),
      filePath: "/fake/src/App.tsx",
      line: 3,
      character: 14,
      version: 1,
    };

    expect(() =>
      handlePrepareRename(
        {
          textDocument: { uri: "file:///fake/src/App.tsx" },
          position: { line: 3, character: 14 },
        },
        deps,
        cursorParams,
      ),
    ).toThrow("Dynamic class expressions cannot be renamed safely.");
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
      selectorMapForPath: () =>
        new Map([
          ["btn-small", info("btn-small", 1)],
          ["btn-large", info("btn-large", 3)],
        ]),
      workspaceRoot: "/fake",
      ...overrides,
    });
  }

  it("rename template-literal class is blocked when expanded references exist", () => {
    const semanticReferenceIndex = buildTemplateSemanticIndex();
    const result = handleRename(
      {
        textDocument: { uri: SCSS_URI },
        position: { line: 1, character: 3 },
        newName: "btn-tiny",
      },
      btnScssDeps({ semanticReferenceIndex }),
    );
    expect(result).toBeNull();
  });

  it("SCSS-side prepareRename rejects class with template/variable references", () => {
    const semanticReferenceIndex = buildTemplateSemanticIndex();
    expectPrepareRenameBlocked(
      () =>
        handlePrepareRename(
          {
            textDocument: { uri: SCSS_URI },
            position: { line: 1, character: 3 },
          },
          btnScssDeps({ semanticReferenceIndex }),
        ),
      "Rename is blocked because inferred or expanded references would make the edit unsafe.",
    );
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
    expectPrepareRenameBlocked(
      () =>
        handlePrepareRename(
          {
            textDocument: { uri: SCSS_URI },
            position: { line: 1, character: 3 },
          },
          btnScssDeps({ semanticReferenceIndex }),
        ),
      "Rename is blocked because inferred or expanded references would make the edit unsafe.",
    );
  });

  it("SCSS-side prepareRename rejects exact-but-expanded semantic references", () => {
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///fake/src/App.tsx", [
      semanticSite({
        uri: "file:///fake/src/App.tsx",
        canonicalName: "btn-small",
        line: 5,
        start: 10,
        end: 30,
        certainty: "exact",
        reason: "templatePrefix",
        expansion: "expanded",
      }),
    ]);
    expectPrepareRenameBlocked(
      () =>
        handlePrepareRename(
          {
            textDocument: { uri: SCSS_URI },
            position: { line: 1, character: 3 },
          },
          btnScssDeps({ semanticReferenceIndex }),
        ),
      "Rename is blocked because inferred or expanded references would make the edit unsafe.",
    );
  });

  it("source-side prepareRename rejects classes with expanded semantic references", () => {
    const semanticReferenceIndex = buildTemplateSemanticIndex();
    const sourceFileCache = new SourceFileCache({ max: 10 });
    const analysisCache = new DocumentAnalysisCache({
      sourceFileCache,
      fileExists: () => true,
      aliasResolver: EMPTY_ALIAS_RESOLVER,
      scanCxImports: (_sourceFile) => ({
        stylesBindings: new Map([
          ["styles", { kind: "resolved" as const, absolutePath: BINDING.scssModulePath }],
        ]),
        bindings: [BINDING],
      }),
      parseClassExpressions: (_sf, bindings) =>
        buildTestClassExpressions({
          filePath: "/fake/src/App.tsx",
          bindings,
          expressions: [
            {
              kind: "literal",
              origin: "cxCall",
              className: "btn-small",
              range: {
                start: { line: 3, character: 14 },
                end: { line: 3, character: 23 },
              },
              scssModulePath: bindings[0]!.scssModulePath,
            },
          ],
        }),
      max: 10,
    });
    const cursorParams: CursorParams = {
      documentUri: "file:///fake/src/App.tsx",
      content: TSX_CONTENT.replace("indicator", "btn-small"),
      filePath: "/fake/src/App.tsx",
      line: 3,
      character: 16,
      version: 1,
    };
    expectPrepareRenameBlocked(
      () =>
        handlePrepareRename(
          {
            textDocument: { uri: "file:///fake/src/App.tsx" },
            position: { line: 3, character: 16 },
          },
          makeBaseDeps({
            analysisCache,
            semanticReferenceIndex,
            selectorMapForPath: () =>
              new Map([
                ["btn-small", info("btn-small", 1)],
                ["btn-large", info("btn-large", 3)],
              ]),
            workspaceRoot: "/fake",
          }),
          cursorParams,
        ),
      "Rename is blocked because inferred or expanded references would make the edit unsafe.",
    );
  });
});

describe("prepareRename through real parseStyleSelectorMap (regression)", () => {
  // These tests exercise prepareRenameFromScss against selector maps
  // built by the real `parseStyleSelectorMap`, to catch regressions where
  // a nested rule silently changes a flat parent's nested-safety state and
  // causes rename to be rejected on the flat parent.
  it("`.button { &:hover {} }` — rename is accepted on the flat .button", async () => {
    const fixture = styleWorkspace(
      SCSS_PATH,
      `./*|*/button {\n  color: red;\n  &:hover { color: blue; }\n}`,
    );
    const classMap = styleClassMap(fixture, SCSS_PATH);
    const deps = makeBaseDeps({
      selectorMapForPath: () => classMap,
      workspaceRoot: "/fake",
    });
    const result = handlePrepareRename(stylePositionParams(fixture, SCSS_URI), deps);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("placeholder", "button");
  });

  it("`.button { &--primary {} }` — both flat .button and nested &--primary are renameable", async () => {
    const fixture = styleWorkspace(
      SCSS_PATH,
      `./*at:flat*/button {\n  color: red;\n  &/*at:nested*/--primary { background: blue; }\n}`,
    );
    const classMap = styleClassMap(fixture, SCSS_PATH);
    const deps = makeBaseDeps({
      selectorMapForPath: () => classMap,
      workspaceRoot: "/fake",
    });
    // Cursor on `.button` at the flat rule — accepted.
    const flat = handlePrepareRename(stylePositionParams(fixture, SCSS_URI, "flat"), deps);
    expect(flat).not.toBeNull();
    expect(flat).toHaveProperty("placeholder", "button");

    // Cursor on the nested `&--primary` — accepted via BEM suffix
    // rename. Placeholder is the resolved class name
    // `"button--primary"`; range covers the `&--primary` slice
    // (10 chars) on its line.
    const nested = handlePrepareRename(stylePositionParams(fixture, SCSS_URI, "nested"), deps);
    expect(nested).not.toBeNull();
    expect(nested).toHaveProperty("placeholder", "button--primary");
    expect((nested as { range: { end: { character: number } } }).range.end.character).toBe(
      targetFixture({ workspace: fixture, markerName: "nested" }).character + 9,
    );
  });
});

describe("&-nested BEM suffix rename", () => {
  // Positive cases (4): strict red→green for BEM-safe shapes.
  it("prepareRename on `&--primary` returns range covering only `&--primary` (10 chars)", async () => {
    const fixture = styleWorkspace(SCSS_PATH, `.button {\n  &/*|*/--primary { color: white; }\n}`);
    const classMap = styleClassMap(fixture, SCSS_PATH);
    const deps = makeBaseDeps({
      selectorMapForPath: () => classMap,
      workspaceRoot: "/fake",
    });
    const result = handlePrepareRename(stylePositionParams(fixture, SCSS_URI), deps);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("placeholder", "button--primary");
    const range = (
      result as { range: { start: { character: number }; end: { character: number } } }
    ).range;
    expect(range.end.character - range.start.character).toBe(10);
  });

  it("rename `button--primary → button--tiny`: SCSS edits only `--primary` slice, TSX full", async () => {
    const fixture = styleWorkspace(SCSS_PATH, `.button {\n  &/*|*/--primary { color: white; }\n}`);
    const classMap = styleClassMap(fixture, SCSS_PATH);
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
      selectorMapForPath: () => classMap,
      workspaceRoot: "/fake",
      semanticReferenceIndex,
    });
    const result = handleRename(styleRenameParams(fixture, SCSS_URI, "button--tiny"), deps);
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
    const target = targetFixture({ workspace: fixture });
    expect(scssEdits[0]!.range.start.character).toBe(target.character);
    expect(scssEdits[0]!.range.end.character).toBe(target.character + 9);
    // TSX: full `button--primary` → `button--tiny`.
    const tsxEdits = edits["file:///fake/src/App.tsx"]!;
    expect(tsxEdits).toHaveLength(1);
    expect(tsxEdits[0]!.newText).toBe("button--tiny");
  });

  it("rename `&__icon`: edits only the `__icon` slice", async () => {
    const cardPath = "/fake/src/Card.module.scss";
    const cardUri = "file:///fake/src/Card.module.scss";
    const fixture = styleWorkspace(cardPath, `.card {\n  &/*|*/__icon { width: 16px; }\n}`);
    const classMap = styleClassMap(fixture, cardPath);
    const deps = makeBaseDeps({
      selectorMapForPath: () => classMap,
      workspaceRoot: "/fake",
    });
    const result = handleRename(styleRenameParams(fixture, cardUri, "card__glyph"), deps);
    expect(result).not.toBeNull();
    const edits = (result as { changes: Record<string, Array<{ newText: string }>> }).changes;
    const scssEdits = edits[cardUri]!;
    expect(scssEdits[0]!.newText).toBe("__glyph");
  });

  it("double-nested `.card { &__icon { &--small {} } }` edits only innermost `--small`", async () => {
    const cardPath = "/fake/src/Card.module.scss";
    const cardUri = "file:///fake/src/Card.module.scss";
    const fixture = styleWorkspace(
      cardPath,
      `.card {\n  &__icon {\n    &/*|*/--small { font-size: 12px; }\n  }\n}`,
    );
    const classMap = styleClassMap(fixture, cardPath);
    const deps = makeBaseDeps({
      selectorMapForPath: () => classMap,
      workspaceRoot: "/fake",
    });
    const result = handleRename(styleRenameParams(fixture, cardUri, "card__icon--xs"), deps);
    expect(result).not.toBeNull();
    const edits = (result as { changes: Record<string, Array<{ newText: string }>> }).changes;
    const scssEdits = edits[cardUri]!;
    expect(scssEdits).toHaveLength(1);
    expect(scssEdits[0]!.newText).toBe("--xs");
  });

  // Negative cases (12): new guards in Commit 4.
  it("rejects cross-parent rename `button--primary → banner--tiny`", async () => {
    const fixture = styleWorkspace(SCSS_PATH, `.button {\n  &/*|*/--primary {}\n}`);
    const classMap = styleClassMap(fixture, SCSS_PATH);
    const deps = makeBaseDeps({ selectorMapForPath: () => classMap, workspaceRoot: "/fake" });
    const result = handleRename(styleRenameParams(fixture, SCSS_URI, "banner--tiny"), deps);
    expect(result).toBeNull();
  });

  it("rejects empty-suffix rename `button--primary → button`", async () => {
    const fixture = styleWorkspace(SCSS_PATH, `.button {\n  &/*|*/--primary {}\n}`);
    const classMap = styleClassMap(fixture, SCSS_PATH);
    const deps = makeBaseDeps({ selectorMapForPath: () => classMap, workspaceRoot: "/fake" });
    const result = handleRename(styleRenameParams(fixture, SCSS_URI, "button"), deps);
    expect(result).toBeNull();
  });

  it("rejects no-op rename `button--primary → button--primary`", async () => {
    const fixture = styleWorkspace(SCSS_PATH, `.button {\n  &/*|*/--primary {}\n}`);
    const classMap = styleClassMap(fixture, SCSS_PATH);
    const deps = makeBaseDeps({ selectorMapForPath: () => classMap, workspaceRoot: "/fake" });
    const result = handleRename(styleRenameParams(fixture, SCSS_URI, "button--primary"), deps);
    expect(result).toBeNull();
  });

  it("rejects interpolated rawToken (guard test — synthetic selector)", () => {
    // Parser cannot produce this shape, but the guard is load-bearing
    // if a future parser change weakens interpolation filtering.
    const synthetic = {
      ...info("btn--primary", 1),
      range: { start: { line: 1, character: 2 }, end: { line: 1, character: 16 } },
      bemSuffix: {
        rawTokenRange: { start: { line: 1, character: 2 }, end: { line: 1, character: 14 } },
        rawToken: "&--#{$mod}",
        parentResolvedName: "btn",
      },
      nestedSafety: "bemSuffixSafe" as const,
      declarations: "",
      ruleRange: { start: { line: 1, character: 0 }, end: { line: 1, character: 16 } },
    };
    const deps = makeBaseDeps({
      selectorMapForPath: () => new Map([["btn--primary", synthetic]]),
      workspaceRoot: "/fake",
    });
    expectPrepareRenameBlocked(
      () =>
        handlePrepareRename(
          { textDocument: { uri: SCSS_URI }, position: { line: 1, character: 3 } },
          deps,
        ),
      "Selectors containing interpolation cannot be renamed safely.",
    );
  });

  it("rejects non-bare parent `.card:hover { &--primary {} }`", async () => {
    const classMap = parseStyleSelectorMap(`.card:hover {\n  &--primary {}\n}`, "/f.module.scss");
    // `card--primary` never exists because extractClassNames strips
    // `:hover--primary` greedily. Any cursor on line 1 falls through.
    expect(classMap.has("card--primary")).toBe(false);
  });

  it("rejects grouped parent `.a, .b { &--c {} }`", async () => {
    const fixture = styleWorkspace(SCSS_PATH, `.a, .b {\n  &/*|*/--c {}\n}`);
    const classMap = styleClassMap(fixture, SCSS_PATH);
    const entry = classMap.get("a--c") ?? classMap.get("b--c");
    expect(entry).toBeDefined();
    // bemSuffix undefined because parentCtx.isGrouped === true
    expect(entry!.bemSuffix).toBeUndefined();
    // prepareRename must refuse
    const deps = makeBaseDeps({ selectorMapForPath: () => classMap, workspaceRoot: "/fake" });
    expectPrepareRenameBlocked(
      () => handlePrepareRename(stylePositionParams(fixture, SCSS_URI), deps),
      "Only flat selectors and safe BEM suffix selectors can be renamed.",
    );
  });

  it("rejects grouped-nested child `.btn { &--a, &--b {} }`", async () => {
    const fixture = styleWorkspace(SCSS_PATH, `.btn {\n  &/*|*/--a, &--b {}\n}`);
    const classMap = styleClassMap(fixture, SCSS_PATH);
    const a = classMap.get("btn--a");
    expect(a).toBeDefined();
    expect(a!.bemSuffix).toBeUndefined();
    const deps = makeBaseDeps({ selectorMapForPath: () => classMap, workspaceRoot: "/fake" });
    expectPrepareRenameBlocked(
      () => handlePrepareRename(stylePositionParams(fixture, SCSS_URI), deps),
      "Only flat selectors and safe BEM suffix selectors can be renamed.",
    );
  });

  it("rejects multi-`&` `.btn { & + &--x {} }`", async () => {
    const fixture = styleWorkspace(SCSS_PATH, `.btn {\n  & + &/*|*/--x {}\n}`);
    const classMap = styleClassMap(fixture, SCSS_PATH);
    const entry = classMap.get("btn--x");
    if (entry !== undefined) {
      expect(entry.bemSuffix).toBeUndefined();
      const deps = makeBaseDeps({ selectorMapForPath: () => classMap, workspaceRoot: "/fake" });
      expectPrepareRenameBlocked(
        () => handlePrepareRename(stylePositionParams(fixture, SCSS_URI), deps),
        "Only flat selectors and safe BEM suffix selectors can be renamed.",
      );
    }
  });

  it("rejects compound `.button { &.active {} }` (active entry has no trio)", async () => {
    const fixture = styleWorkspace(SCSS_PATH, `.button {\n  &/*|*/.active {}\n}`);
    const classMap = styleClassMap(fixture, SCSS_PATH);
    const active = classMap.get("active")!;
    expect(active.nestedSafety).toBe("nestedUnsafe");
    expect(active.bemSuffix).toBeUndefined();
    const deps = makeBaseDeps({ selectorMapForPath: () => classMap, workspaceRoot: "/fake" });
    const result = handlePrepareRename(stylePositionParams(fixture, SCSS_URI), deps);
    expect(result).toBeNull();
  });

  it("rejects invalid newName (empty string)", async () => {
    const fixture = styleWorkspace(SCSS_PATH, `.button {\n  &/*|*/--primary {}\n}`);
    const classMap = styleClassMap(fixture, SCSS_PATH);
    const deps = makeBaseDeps({ selectorMapForPath: () => classMap, workspaceRoot: "/fake" });
    const result = handleRename(styleRenameParams(fixture, SCSS_URI, ""), deps);
    expect(result).toBeNull();
  });

  it("rejects invalid newName (numeric start)", async () => {
    const fixture = styleWorkspace(SCSS_PATH, `.button {\n  &/*|*/--primary {}\n}`);
    const classMap = styleClassMap(fixture, SCSS_PATH);
    const deps = makeBaseDeps({ selectorMapForPath: () => classMap, workspaceRoot: "/fake" });
    const result = handleRename(styleRenameParams(fixture, SCSS_URI, "123xyz"), deps);
    expect(result).toBeNull();
  });

  it("regression: nested `&--primary` + template `cx(\\`button--${x}\\`)` still rejects via expanded-sites", async () => {
    const fixture = styleWorkspace(SCSS_PATH, `.button {\n  &/*|*/--primary {}\n}`);
    const classMap = styleClassMap(fixture, SCSS_PATH);
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
      selectorMapForPath: () => classMap,
      workspaceRoot: "/fake",
      semanticReferenceIndex,
    });
    expectPrepareRenameBlocked(
      () => handlePrepareRename(stylePositionParams(fixture, SCSS_URI), deps),
      "Rename is blocked because inferred or expanded references would make the edit unsafe.",
    );
  });
});

/**
 * Alias-first iteration order. Production `expandSelectorMapWithTransform`
 * puts originals before aliases, which makes SCSS-cursor always hit
 * the original. To exercise the alias-selector code path from
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

function aliasFirstCamelCaseMap(base: ReadonlyMap<string, ReturnType<typeof info>>) {
  const expanded = new Map<string, ReturnType<typeof info>>();
  for (const [name, entry] of base) {
    const alias = camelOf(name);
    if (alias !== name && !expanded.has(alias)) {
      expanded.set(alias, { ...entry, name: alias, originalName: name, canonicalName: name });
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
    const base = parseStyleSelectorMap(`.btn-primary { color: red; }`, SCSS_PATH);
    const classMap = aliasFirstCamelCaseMap(base);
    // sanity: alias iterates first
    const firstKey = classMap.keys().next().value;
    expect(firstKey).toBe("btnPrimary");
    const original = base.get("btn-primary")!;

    const deps = makeBaseDeps({
      selectorMapForPath: () => classMap,
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
    const base = parseStyleSelectorMap(`.btn-primary {\n  &--xl {}\n}`, SCSS_PATH);
    const classMap = aliasFirstCamelCaseMap(base);
    // sanity: alias entries exist
    expect(classMap.has("btnPrimaryXl")).toBe(true);
    expect(classMap.get("btnPrimaryXl")!.originalName).toBe("btn-primary--xl");
    const originalNested = base.get("btn-primary--xl")!;
    const rawRange = originalNested.bemSuffix!.rawTokenRange;

    const deps = makeBaseDeps({
      selectorMapForPath: () => classMap,
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
    const base = parseStyleSelectorMap(`.btn-primary { color: red; }`, SCSS_PATH);
    // Production expansion (original-first) — findSelectorAtCursor
    // returns the non-alias entry.
    const classMap = expandSelectorMapWithTransform(base, "camelCase");
    const original = base.get("btn-primary")!;

    const deps = makeBaseDeps({
      selectorMapForPath: () => classMap,
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
    const base = parseStyleSelectorMap(`.btn-primary { color: red; }`, SCSS_PATH);
    // camelCaseOnly drops the original; only `btnPrimary` alias remains.
    const classMap = expandSelectorMapWithTransform(base, "camelCaseOnly");
    expect(classMap.has("btn-primary")).toBe(false);
    expect(classMap.get("btnPrimary")!.originalName).toBe("btn-primary");
    const alias = classMap.get("btnPrimary")!;

    const deps = makeBaseDeps({
      selectorMapForPath: () => classMap,
      workspaceRoot: "/fake",
      settings: withTransformMode("camelCaseOnly"),
    });
    expectPrepareRenameBlocked(
      () =>
        handlePrepareRename(
          {
            textDocument: { uri: SCSS_URI },
            position: {
              line: alias.range.start.line,
              character: alias.range.start.character + 1,
            },
          },
          deps,
        ),
      "Alias selector views cannot be renamed under the current classnameTransform mode.",
    );
  });

  it("dashesOnly: alias rename is rejected at prepareRename", async () => {
    const base = parseStyleSelectorMap(`.btn-primary { color: red; }`, SCSS_PATH);
    const classMap = expandSelectorMapWithTransform(base, "dashesOnly");
    expect(classMap.get("btnPrimary")!.originalName).toBe("btn-primary");
    const alias = classMap.get("btnPrimary")!;

    const deps = makeBaseDeps({
      selectorMapForPath: () => classMap,
      workspaceRoot: "/fake",
      settings: withTransformMode("dashesOnly"),
    });
    expectPrepareRenameBlocked(
      () =>
        handlePrepareRename(
          {
            textDocument: { uri: SCSS_URI },
            position: {
              line: alias.range.start.line,
              character: alias.range.start.character + 1,
            },
          },
          deps,
        ),
      "Alias selector views cannot be renamed under the current classnameTransform mode.",
    );
  });

  it("camelCase: canonical-form and alias-form sites both rewrite with per-site format", async () => {
    const base = parseStyleSelectorMap(`.btn-primary { color: red; }`, SCSS_PATH);
    const classMap = expandSelectorMapWithTransform(base, "camelCase");
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
      selectorMapForPath: () => classMap,
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
    const base = parseStyleSelectorMap(`.btn-primary { color: red; }`, SCSS_PATH);
    const classMap = expandSelectorMapWithTransform(base, "camelCase");
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
      selectorMapForPath: () => classMap,
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
    const base = parseStyleSelectorMap(`.btn-primary { color: red; }`, SCSS_PATH);
    const classMap = expandSelectorMapWithTransform(base, "camelCase");
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
      selectorMapForPath: () => classMap,
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
    const base = parseStyleSelectorMap(`.btn-primary { color: red; }`, SCSS_PATH);
    const classMap = expandSelectorMapWithTransform(base, "camelCase");
    // Both keys present.
    expect(classMap.has("btn-primary")).toBe(true);
    expect(classMap.has("btnPrimary")).toBe(true);
    const original = base.get("btn-primary")!;

    const hit = findSelectorAtCursor(
      buildStyleDocumentFromSelectorMap(SCSS_PATH, classMap),
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
    const base = parseStyleSelectorMap(`.btn-primary { color: red; }`, SCSS_PATH);
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
      selectorMapForPath: () => classMap,
      workspaceRoot: "/fake",
      semanticReferenceIndex,
      settings: withTransformMode("camelCase"),
    });
    // Cursor hits the alias first (alias-first iteration). Without
    // the union, the single-key check against `btnPrimary` would
    // miss the expanded site keyed on `btn-primary` and allow the
    // rename — rewriting the template and destroying the source.
    expectPrepareRenameBlocked(
      () =>
        handlePrepareRename(
          {
            textDocument: { uri: SCSS_URI },
            position: {
              line: original.range.start.line,
              character: original.range.start.character + 1,
            },
          },
          deps,
        ),
      "Rename is blocked because inferred or expanded references would make the edit unsafe.",
    );
  });

  it("regression: semantic expanded site on original key rejects rename via alias cursor", async () => {
    const base = parseStyleSelectorMap(`.btn-primary { color: red; }`, SCSS_PATH);
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
      selectorMapForPath: () => classMap,
      workspaceRoot: "/fake",
      semanticReferenceIndex,
      settings: withTransformMode("camelCase"),
    });
    expectPrepareRenameBlocked(
      () =>
        handlePrepareRename(
          {
            textDocument: { uri: SCSS_URI },
            position: {
              line: original.range.start.line,
              character: original.range.start.character + 1,
            },
          },
          deps,
        ),
      "Rename is blocked because inferred or expanded references would make the edit unsafe.",
    );
  });
});
