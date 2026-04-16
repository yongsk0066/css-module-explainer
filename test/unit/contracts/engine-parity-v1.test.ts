import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildCheckerEngineParitySnapshotV1 } from "../../../server/engine-host-node/src/engine-parity-v1";
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

describe("buildCheckerEngineParitySnapshotV1", () => {
  it("assembles a parity snapshot from current host outputs", async () => {
    const workspaceRoot = makeWorkspace({
      "src/App.tsx": [
        "import classNames from 'classnames/bind';",
        "import styles from './Button.module.scss';",
        "const cx = classNames.bind(styles);",
        "const cls = cx('missing');",
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

    const snapshot = buildCheckerEngineParitySnapshotV1({
      workspaceRoot,
      classnameTransform: "asIs",
      pathAlias: {},
      sourceDocuments,
      styleFiles,
      analysisCache: analysisHost.analysisCache,
      styleDocumentForPath: styleHost.styleDocumentForPath,
      typeResolver: analysisHost.typeResolver,
      checkerReport: command.checkerReport,
    });

    expect(snapshot.input.version).toBe("1");
    expect(snapshot.output.version).toBe("1");
    expect(snapshot.output.checkerReport.version).toBe("1");
    expect(snapshot.output.checkerReport.summary).toEqual({
      warnings: 1,
      hints: 1,
      total: 2,
    });
    expect(snapshot.output.queryResults).toEqual([]);
    expect(snapshot.output.rewritePlans).toEqual([]);
  });
});

function makeWorkspace(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "engine-parity-v1-"));
  tempDirs.push(root);
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, "utf8");
  }
  return root;
}
