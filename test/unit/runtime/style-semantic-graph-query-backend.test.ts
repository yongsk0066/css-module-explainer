import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../../server/engine-core-ts/src/settings";
import {
  resolveRustStyleSemanticGraph,
  type StyleSemanticGraphRunnerInputV0,
} from "../../../server/engine-host-node/src/style-semantic-graph-query-backend";
import { infoAtLine, makeBaseDeps } from "../../_fixtures/test-helpers";

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
          return {
            schemaVersion: "0",
            product: "omena-semantic.style-semantic-graph",
            language: "scss",
            parserFacts: {},
            semanticFacts: {},
            selectorIdentityEngine: {},
            sourceInputEvidence: {},
            promotionEvidence: {},
            losslessCstContract: {},
          } as T;
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
});
