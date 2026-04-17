import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildCheckerEngineParitySnapshotV2 } from "../../../server/engine-host-node/src/engine-parity-v2";
import { runWorkspaceCheckCommand } from "../../../server/engine-host-node/src/checker-host";
import {
  collectSourceDocuments,
  createWorkspaceAnalysisHost,
  createWorkspaceStyleHost,
  resolveWorkspaceCheckFiles,
} from "../../../server/engine-host-node/src/checker-host/workspace-check-support";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("buildCheckerEngineParitySnapshotV2", () => {
  it("assembles a v2 parity snapshot while reusing v1 query output", async () => {
    const workspaceRoot = makeWorkspace({
      "src/App.tsx": [
        "import classNames from 'classnames/bind';",
        "import styles from './Button.module.scss';",
        "const cx = classNames.bind(styles);",
        "const size = true ? 'missing' : 'missing';",
        "const cls = cx(size);",
        "",
      ].join("\n"),
      "src/Button.module.scss": ".button {}",
    });

    const { sourceFiles, styleFiles } = await resolveWorkspaceCheckFiles({ workspaceRoot });
    const styleHost = createWorkspaceStyleHost({
      styleFiles,
      classnameTransform: "asIs",
    });
    styleHost.preloadStyleDocuments();
    const analysisHost = createWorkspaceAnalysisHost({
      workspaceRoot,
      classnameTransform: "asIs",
      pathAlias: {},
      styleDocumentForPath: styleHost.styleDocumentForPath,
    });
    const sourceDocuments = collectSourceDocuments(sourceFiles, analysisHost.analysisCache);
    const command = await runWorkspaceCheckCommand({
      workspace: { workspaceRoot },
      filters: {
        preset: "ci",
        category: "all",
        severity: "all",
        includeBundles: ["ci-default"],
        includeCodes: [],
        excludeCodes: [],
      },
    });

    const snapshot = buildCheckerEngineParitySnapshotV2({
      workspaceRoot,
      classnameTransform: "asIs",
      pathAlias: {},
      sourceDocuments,
      styleFiles,
      analysisCache: analysisHost.analysisCache,
      styleDocumentForPath: styleHost.styleDocumentForPath,
      typeResolver: analysisHost.typeResolver,
      checkerReport: command.checkerReport,
      semanticReferenceIndex: analysisHost.semanticReferenceIndex,
      styleDependencyGraph: styleHost.styleDependencyGraph,
    });

    expect(snapshot.input.version).toBe("2");
    expect(snapshot.output.version).toBe("2");
    expect(snapshot.input.typeFacts[0]?.facts.kind).toMatch(
      /^(exact|finiteSet|unknown|top|constrained)$/,
    );
    expect(snapshot.output.queryResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "expression-semantics",
          filePath: path.join(workspaceRoot, "src/App.tsx"),
        }),
      ]),
    );
  });
});

function makeWorkspace(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "engine-parity-v2-"));
  tempDirs.push(root);
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, "utf8");
  }
  return root;
}
