import { describe, expect, it } from "vitest";
import type { EngineInputV2 } from "../../../server/engine-core-ts/src/contracts";
import { DEFAULT_SETTINGS } from "../../../server/engine-core-ts/src/settings";
import {
  buildStyleSemanticGraphSelectorIdentityReadModels,
  resolveRustStyleSemanticGraph,
  resolveRustStyleSemanticGraphForWorkspaceTarget,
  type StyleSemanticGraphSummaryV0,
  type StyleSemanticGraphRunnerInputV0,
} from "../../../server/engine-host-node/src/style-semantic-graph-query-backend";
import { infoAtLine, makeBaseDeps } from "../../_fixtures/test-helpers";
import { buildStyleDocumentFromSelectorMap } from "../../_fixtures/style-documents";

const SCSS_PATH = "/fake/ws/src/Button.module.scss";
const SCSS_SOURCE = ".button { color: red; }";

describe("style semantic graph query backend", () => {
  it("routes host style semantic graph reads through the selected-query runner", () => {
    const deps = makeBaseDeps({
      selectorMapForPath: (filePath) =>
        filePath === SCSS_PATH ? new Map([["button", infoAtLine("button", 1)]]) : null,
      readStyleFile: (filePath) => (filePath === SCSS_PATH ? SCSS_SOURCE : null),
      workspaceRoot: "/fake/ws",
    });
    let runnerCommand: string | null = null;
    let runnerInput: StyleSemanticGraphRunnerInputV0 | null = null;

    const graph = resolveRustStyleSemanticGraph(
      {
        workspaceRoot: "/fake/ws",
        classnameTransform: DEFAULT_SETTINGS.scss.classnameTransform,
        pathAlias: DEFAULT_SETTINGS.pathAlias,
        sourceDocuments: [],
        styleFiles: [],
        analysisCache: deps.analysisCache,
        styleDocumentForPath: deps.styleDocumentForPath,
        typeResolver: deps.typeResolver,
        readStyleFile: deps.readStyleFile,
      },
      SCSS_PATH,
      {
        runRustSelectedQueryBackendJson: <T>(command: string, input: unknown): T => {
          runnerCommand = command;
          runnerInput = input as StyleSemanticGraphRunnerInputV0;
          return makeGraph() as T;
        },
      },
    );

    expect(graph?.product).toBe("omena-semantic.style-semantic-graph");
    expect(runnerCommand).toBe("style-semantic-graph");
    expect(runnerInput).toMatchObject({
      stylePath: SCSS_PATH,
      styleSource: SCSS_SOURCE,
    });
    expect(runnerInput?.engineInput.styles).toHaveLength(1);
    expect(runnerInput?.engineInput.styles[0]?.filePath).toBe(SCSS_PATH);
  });

  it("attaches host HIR ranges to rust selector identity graph entries", () => {
    const styleDocument = buildStyleDocumentFromSelectorMap(
      SCSS_PATH,
      new Map([
        ["button", infoAtLine("button", 2)],
        ["icon", infoAtLine("icon", 5)],
      ]),
    );

    expect(buildStyleSemanticGraphSelectorIdentityReadModels(makeGraph(), styleDocument)).toEqual([
      {
        canonicalId: "selector:button",
        canonicalName: "button",
        identityKind: "localClass",
        rewriteSafety: "safe",
        blockers: [],
        range: { start: { line: 2, character: 1 }, end: { line: 2, character: 7 } },
        ruleRange: { start: { line: 2, character: 0 }, end: { line: 4, character: 1 } },
        viewKind: "canonical",
      },
    ]);
  });

  it("omits rust selector identities that have no current host HIR range", () => {
    const styleDocument = buildStyleDocumentFromSelectorMap(
      SCSS_PATH,
      new Map([["icon", infoAtLine("icon", 5)]]),
    );

    expect(buildStyleSemanticGraphSelectorIdentityReadModels(makeGraph(), styleDocument)).toEqual(
      [],
    );
  });

  it("does not spawn rust when the target style source is unavailable", () => {
    const deps = makeBaseDeps({ readStyleFile: () => null });

    const graph = resolveRustStyleSemanticGraph(
      {
        workspaceRoot: "/fake/ws",
        classnameTransform: DEFAULT_SETTINGS.scss.classnameTransform,
        pathAlias: DEFAULT_SETTINGS.pathAlias,
        sourceDocuments: [],
        styleFiles: [SCSS_PATH],
        analysisCache: deps.analysisCache,
        styleDocumentForPath: deps.styleDocumentForPath,
        typeResolver: deps.typeResolver,
        readStyleFile: deps.readStyleFile,
      },
      SCSS_PATH,
      {
        runRustSelectedQueryBackendJson: () => {
          throw new Error("unexpected rust runner call");
        },
      },
    );

    expect(graph).toBeNull();
  });

  it("uses precomputed workspace inputs for workspace target graph reads", () => {
    const deps = makeBaseDeps({
      selectorMapForPath: (filePath) =>
        filePath === SCSS_PATH ? new Map([["button", infoAtLine("button", 1)]]) : null,
      readStyleFile: (filePath) => (filePath === SCSS_PATH ? SCSS_SOURCE : null),
      workspaceRoot: "/fake/ws",
    });
    let runnerInput: StyleSemanticGraphRunnerInputV0 | null = null;

    const graph = resolveRustStyleSemanticGraphForWorkspaceTarget(
      {
        workspaceRoot: "/fake/ws",
        classnameTransform: DEFAULT_SETTINGS.scss.classnameTransform,
        pathAlias: DEFAULT_SETTINGS.pathAlias,
      },
      {
        analysisCache: deps.analysisCache,
        styleDocumentForPath: deps.styleDocumentForPath,
        typeResolver: deps.typeResolver,
        readStyleFile: deps.readStyleFile,
      },
      SCSS_PATH,
      {
        sourceDocuments: [
          {
            uri: "file:///fake/ws/src/App.tsx",
            filePath: "/fake/ws/src/App.tsx",
            content: "const app = true;",
            version: 1,
          },
        ],
        styleFiles: [SCSS_PATH],
        runRustSelectedQueryBackendJson: <T>(_command: string, input: unknown): T => {
          runnerInput = input as StyleSemanticGraphRunnerInputV0;
          return makeGraph() as T;
        },
      },
    );

    expect(graph?.product).toBe("omena-semantic.style-semantic-graph");
    expect(runnerInput?.engineInput.sources).toHaveLength(1);
    expect(runnerInput?.engineInput.sources[0]?.filePath).toBe("/fake/ws/src/App.tsx");
    expect(runnerInput?.engineInput.styles.map((style) => style.filePath)).toEqual([SCSS_PATH]);
  });

  it("reuses a precomputed engine input for style semantic graph runner calls", () => {
    const deps = makeBaseDeps({
      selectorMapForPath: (filePath) =>
        filePath === SCSS_PATH ? new Map([["button", infoAtLine("button", 1)]]) : null,
      readStyleFile: (filePath) => (filePath === SCSS_PATH ? SCSS_SOURCE : null),
      workspaceRoot: "/fake/ws",
    });
    const engineInput: EngineInputV2 = {
      version: "2",
      workspace: {
        root: "/fake/ws",
        classnameTransform: DEFAULT_SETTINGS.scss.classnameTransform,
        settingsKey: "precomputed",
      },
      sources: [],
      styles: [],
      typeFacts: [],
    };
    let runnerInput: StyleSemanticGraphRunnerInputV0 | null = null;

    resolveRustStyleSemanticGraph(
      {
        workspaceRoot: "/fake/ws",
        classnameTransform: DEFAULT_SETTINGS.scss.classnameTransform,
        pathAlias: DEFAULT_SETTINGS.pathAlias,
        sourceDocuments: [],
        styleFiles: [SCSS_PATH],
        analysisCache: deps.analysisCache,
        styleDocumentForPath: deps.styleDocumentForPath,
        typeResolver: deps.typeResolver,
        readStyleFile: deps.readStyleFile,
      },
      SCSS_PATH,
      {
        engineInput,
        runRustSelectedQueryBackendJson: <T>(_command: string, input: unknown): T => {
          runnerInput = input as StyleSemanticGraphRunnerInputV0;
          return makeGraph() as T;
        },
      },
    );

    expect(runnerInput?.engineInput).toBe(engineInput);
  });

  it("reuses cached workspace target graph reads for the same style path", () => {
    const deps = makeBaseDeps({
      selectorMapForPath: (filePath) =>
        filePath === SCSS_PATH ? new Map([["button", infoAtLine("button", 1)]]) : null,
      readStyleFile: (filePath) => (filePath === SCSS_PATH ? SCSS_SOURCE : null),
      workspaceRoot: "/fake/ws",
    });
    let runnerCalls = 0;
    const styleSemanticGraphCache = new Map<string, StyleSemanticGraphSummaryV0 | null>();
    const queryOptions = {
      sourceDocuments: [],
      styleFiles: [SCSS_PATH],
      styleSemanticGraphCache,
      runRustSelectedQueryBackendJson: <T>(): T => {
        runnerCalls += 1;
        return makeGraph() as T;
      },
    };

    const first = resolveRustStyleSemanticGraphForWorkspaceTarget(
      {
        workspaceRoot: "/fake/ws",
        classnameTransform: DEFAULT_SETTINGS.scss.classnameTransform,
        pathAlias: DEFAULT_SETTINGS.pathAlias,
      },
      {
        analysisCache: deps.analysisCache,
        styleDocumentForPath: deps.styleDocumentForPath,
        typeResolver: deps.typeResolver,
        readStyleFile: deps.readStyleFile,
      },
      SCSS_PATH,
      queryOptions,
    );
    const second = resolveRustStyleSemanticGraphForWorkspaceTarget(
      {
        workspaceRoot: "/fake/ws",
        classnameTransform: DEFAULT_SETTINGS.scss.classnameTransform,
        pathAlias: DEFAULT_SETTINGS.pathAlias,
      },
      {
        analysisCache: deps.analysisCache,
        styleDocumentForPath: deps.styleDocumentForPath,
        typeResolver: deps.typeResolver,
        readStyleFile: deps.readStyleFile,
      },
      SCSS_PATH,
      queryOptions,
    );

    expect(first).toBe(second);
    expect(runnerCalls).toBe(1);
  });
});

function makeGraph(): StyleSemanticGraphSummaryV0 {
  return {
    schemaVersion: "0",
    product: "omena-semantic.style-semantic-graph",
    language: "scss",
    parserFacts: {},
    semanticFacts: {},
    selectorIdentityEngine: {
      schemaVersion: "0",
      product: "omena-semantic.selector-identity",
      canonicalIdCount: 1,
      canonicalIds: [
        {
          canonicalId: "selector:button",
          localName: "button",
          identityKind: "localClass",
          rewriteSafety: "safe",
          blockers: [],
        },
      ],
      rewriteSafety: {
        allCanonicalIdsRewriteSafe: true,
        safeCanonicalIds: ["selector:button"],
        blockedCanonicalIds: [],
        blockers: [],
      },
    },
    selectorReferenceEngine: {
      schemaVersion: "0",
      product: "omena-semantic.selector-references",
      stylePath: "/fake/ws/src/Button.module.scss",
      selectorCount: 1,
      referencedSelectorCount: 0,
      unreferencedSelectorCount: 1,
      totalReferenceSites: 0,
      selectors: [],
    },
    sourceInputEvidence: {},
    promotionEvidence: {},
    losslessCstContract: {},
  };
}
