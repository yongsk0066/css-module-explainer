import { describe, expect, it } from "vitest";
import { pnpmExecutable } from "../../../packages/check-orchestrator/src/cli/commands";

describe("check orchestrator CLI command helpers", () => {
  it("uses pnpm.cmd on Windows so spawnSync can launch the shim without a shell", () => {
    expect(pnpmExecutable("win32")).toBe("pnpm.cmd");
  });

  it("uses pnpm on non-Windows platforms", () => {
    expect(pnpmExecutable("darwin")).toBe("pnpm");
    expect(pnpmExecutable("linux")).toBe("pnpm");
  });
});
