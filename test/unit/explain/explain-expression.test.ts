import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { explainExpressionAtLocation } from "../../../server/engine-host-node/src/explain-expression";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("explainExpressionAtLocation", () => {
  it("returns dynamic explanation details for a local flow expression", () => {
    const workspaceRoot = makeWorkspace({
      "src/App.tsx": [
        "import classNames from 'classnames/bind';",
        "import styles from './Button.module.scss';",
        "const cx = classNames.bind(styles);",
        "export function App(enabled: boolean) {",
        "  const size = enabled ? 'small' : 'large';",
        "  return <div className={cx(size)} />;",
        "}",
        "",
      ].join("\n"),
      "src/Button.module.scss": ".small {}",
    });

    const result = explainExpressionAtLocation({
      workspaceRoot,
      filePath: path.join(workspaceRoot, "src/App.tsx"),
      line: 5,
      character: 28,
    });

    expect(result).toEqual(
      expect.objectContaining({
        expressionKind: "symbolRef",
        styleFilePath: path.join(workspaceRoot, "src/Button.module.scss"),
        selectorNames: ["small"],
        dynamicExplanation: expect.objectContaining({
          subject: "size",
          valueCertainty: "inferred",
          valueCertaintyShapeLabel: "bounded finite (2)",
          valueCertaintyReasonLabel: "analysis preserved multiple finite candidate values",
          selectorCertainty: "inferred",
          selectorCertaintyShapeLabel: "bounded selector set (1)",
        }),
      }),
    );
  });

  it("returns null when the cursor does not hit an explainable class expression", () => {
    const workspaceRoot = makeWorkspace({
      "src/App.tsx": [
        "import classNames from 'classnames/bind';",
        "import styles from './Button.module.scss';",
        "const cx = classNames.bind(styles);",
        "const ok = cx('small');",
        "",
      ].join("\n"),
      "src/Button.module.scss": ".small {}",
    });

    const result = explainExpressionAtLocation({
      workspaceRoot,
      filePath: path.join(workspaceRoot, "src/App.tsx"),
      line: 0,
      character: 0,
    });

    expect(result).toBeNull();
  });
});

function makeWorkspace(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "explain-expression-"));
  tempDirs.push(root);
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, "utf8");
  }
  return root;
}
