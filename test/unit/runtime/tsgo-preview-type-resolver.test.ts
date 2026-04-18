import { describe, expect, it } from "vitest";
import type { Range, ResolvedType } from "@css-module-explainer/shared";
import type { TypeResolver } from "../../../server/engine-core-ts/src/core/ts/type-resolver";
import { TsgoPreviewTypeResolver } from "../../../server/engine-host-node/src/tsgo-preview-type-resolver";

const SAMPLE_RANGE: Range = {
  start: { line: 0, character: 0 },
  end: { line: 0, character: 1 },
};

describe("TsgoPreviewTypeResolver", () => {
  it("probes once per workspace and delegates to the fallback resolver", () => {
    const probeCalls: string[] = [];
    const resolveCalls: string[] = [];
    const fallbackResolver = createFakeResolver(resolveCalls);

    const resolver = new TsgoPreviewTypeResolver({
      fallbackResolver,
      findConfigFile: (workspaceRoot) => `${workspaceRoot}/tsconfig.json`,
      runPreviewCommand: (workspaceRoot) => {
        probeCalls.push(workspaceRoot);
        return { status: 0, stdout: "", stderr: "" };
      },
    });

    resolver.resolve("/repo/src/App.tsx", "variant", "/repo", SAMPLE_RANGE);
    resolver.resolve("/repo/src/App.tsx", "variant", "/repo", SAMPLE_RANGE);

    expect(probeCalls).toEqual(["/repo"]);
    expect(resolveCalls).toEqual(["/repo", "/repo"]);
  });

  it("re-probes after invalidation", () => {
    const probeCalls: string[] = [];
    const resolver = new TsgoPreviewTypeResolver({
      fallbackResolver: createFakeResolver([]),
      findConfigFile: (workspaceRoot) => `${workspaceRoot}/tsconfig.json`,
      runPreviewCommand: (workspaceRoot) => {
        probeCalls.push(workspaceRoot);
        return { status: 0, stdout: "", stderr: "" };
      },
    });

    resolver.resolve("/repo/src/App.tsx", "variant", "/repo", SAMPLE_RANGE);
    resolver.invalidate("/repo");
    resolver.resolve("/repo/src/App.tsx", "variant", "/repo", SAMPLE_RANGE);

    expect(probeCalls).toEqual(["/repo", "/repo"]);
  });

  it("throws when the preview probe fails", () => {
    const resolver = new TsgoPreviewTypeResolver({
      fallbackResolver: createFakeResolver([]),
      findConfigFile: (workspaceRoot) => `${workspaceRoot}/tsconfig.json`,
      runPreviewCommand: () => ({
        status: 1,
        stdout: "",
        stderr: "preview failed",
      }),
    });

    expect(() => resolver.resolve("/repo/src/App.tsx", "variant", "/repo", SAMPLE_RANGE)).toThrow(
      "tsgo-preview probe failed",
    );
  });
});

function createFakeResolver(calls: string[]): TypeResolver {
  return {
    resolve(_filePath: string, _variableName: string, workspaceRoot: string): ResolvedType {
      calls.push(workspaceRoot);
      return { kind: "unresolvable", values: [] };
    },
    invalidate() {},
    clear() {},
  };
}
