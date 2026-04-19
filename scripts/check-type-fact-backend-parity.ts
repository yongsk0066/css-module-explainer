import path from "node:path";
import {
  collectSourceDocuments,
  createWorkspaceAnalysisHost,
  createWorkspaceStyleHost,
} from "../server/engine-host-node/src/checker-host/workspace-check-support";
import { buildEngineInputV2 } from "../server/engine-host-node/src/engine-input-v2";
import { stableJsonStringify } from "./contract-parity-runtime";

const repoRoot = process.cwd();
const parityFixtures = [
  {
    fixture: "literal-union",
    workspaceRoot: path.join(repoRoot, "test/_fixtures/type-fact-backend-parity/literal-union"),
    sourceFilePaths: [
      path.join(repoRoot, "test/_fixtures/type-fact-backend-parity/literal-union/src/App.ts"),
    ],
    styleFilePaths: [
      path.join(
        repoRoot,
        "test/_fixtures/type-fact-backend-parity/literal-union/src/App.module.scss",
      ),
    ],
  },
  {
    fixture: "path-alias",
    workspaceRoot: path.join(repoRoot, "test/_fixtures/type-fact-backend-parity/path-alias"),
    sourceFilePaths: [
      path.join(repoRoot, "test/_fixtures/type-fact-backend-parity/path-alias/src/App.ts"),
    ],
    styleFilePaths: [
      path.join(repoRoot, "test/_fixtures/type-fact-backend-parity/path-alias/src/App.module.scss"),
    ],
  },
] as const;

void (async () => {
  const results = await Promise.all(
    parityFixtures.map(async (entry) => {
      const baseline = await buildTypeFactSnapshot(entry, "typescript-current");
      const preview = await buildTypeFactSnapshot(entry, "tsgo-preview");
      return {
        fixture: entry.fixture,
        v2Matches:
          stableJsonStringify(baseline.typeFacts) === stableJsonStringify(preview.typeFacts),
        baseline: {
          v2TypeFacts: baseline.typeFacts,
        },
        preview: {
          v2TypeFacts: preview.typeFacts,
        },
      };
    }),
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: "2",
        tool: "css-module-explainer/type-fact-backend-parity",
        results,
      },
      null,
      2,
    )}\n`,
  );

  process.exitCode = results.every((result) => result.v2Matches) ? 0 : 1;
})();

async function buildTypeFactSnapshot(
  fixture: {
    readonly fixture: string;
    readonly workspaceRoot: string;
    readonly sourceFilePaths: readonly string[];
    readonly styleFilePaths: readonly string[];
  },
  typeBackend: "typescript-current" | "tsgo-preview",
) {
  const styleFiles = fixture.styleFilePaths;
  const styleHost = createWorkspaceStyleHost({
    styleFiles,
    classnameTransform: "asIs",
  });
  const analysisHost = createWorkspaceAnalysisHost({
    workspaceRoot: fixture.workspaceRoot,
    classnameTransform: "asIs",
    pathAlias: {},
    styleDocumentForPath: styleHost.styleDocumentForPath,
    typeBackend,
    env: {
      ...process.env,
      CME_TYPE_FACT_BACKEND: typeBackend,
    },
  });
  const sourceDocuments = collectSourceDocuments(
    fixture.sourceFilePaths,
    analysisHost.analysisCache,
  );

  return buildEngineInputV2({
    workspaceRoot: fixture.workspaceRoot,
    classnameTransform: "asIs",
    pathAlias: {},
    sourceDocuments,
    styleFiles,
    analysisCache: analysisHost.analysisCache,
    styleDocumentForPath: styleHost.styleDocumentForPath,
    typeBackend,
    env: {
      ...process.env,
      CME_TYPE_FACT_BACKEND: typeBackend,
    },
  });
}
