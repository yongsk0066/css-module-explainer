import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const HANDLER = path.join(REPO_ROOT, "server/adapter-vscode/src/handler-registration.ts");

describe("handler/runtime contracts", () => {
  it("keeps watched-file classification in runtime helpers", () => {
    const source = readFileSync(HANDLER, "utf8");

    expect(source).toContain('from "../../engine-host-node/src/runtime"');
    expect(source).not.toContain("/core/scss/scss-index");
    expect(source).not.toContain("function isProjectConfigPath(");
    expect(source).not.toContain("function hasStyleSemanticChange(");
    expect(source).not.toContain("function readCurrentStyleContent(");
  });
});
