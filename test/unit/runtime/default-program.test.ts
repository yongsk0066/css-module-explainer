import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDefaultProgram,
  resolveMaxSyncProgramFiles,
} from "../../../server/engine-core-ts/src/core/ts/default-program";

const originalMaxSyncProgramFiles = process.env.CME_TYPE_FACT_MAX_SYNC_PROGRAM_FILES;
const tempRoots: string[] = [];

afterEach(() => {
  if (originalMaxSyncProgramFiles === undefined) {
    delete process.env.CME_TYPE_FACT_MAX_SYNC_PROGRAM_FILES;
  } else {
    process.env.CME_TYPE_FACT_MAX_SYNC_PROGRAM_FILES = originalMaxSyncProgramFiles;
  }

  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("createDefaultProgram", () => {
  it("returns an empty program when the sync root-file budget is exceeded", () => {
    process.env.CME_TYPE_FACT_MAX_SYNC_PROGRAM_FILES = "2";
    const workspaceRoot = createWorkspaceWithTsFiles(3);

    const program = createDefaultProgram(workspaceRoot);

    expect(program.getRootFileNames()).toEqual([]);
  });

  it("allows the sync root-file budget to be disabled", () => {
    process.env.CME_TYPE_FACT_MAX_SYNC_PROGRAM_FILES = "0";
    const workspaceRoot = createWorkspaceWithTsFiles(3);

    const program = createDefaultProgram(workspaceRoot);

    expect(program.getRootFileNames()).toHaveLength(3);
  });

  it("normalizes the sync root-file budget env", () => {
    expect(resolveMaxSyncProgramFiles({})).toBe(500);
    expect(resolveMaxSyncProgramFiles({ CME_TYPE_FACT_MAX_SYNC_PROGRAM_FILES: "12.8" })).toBe(12);
    expect(resolveMaxSyncProgramFiles({ CME_TYPE_FACT_MAX_SYNC_PROGRAM_FILES: "off" })).toBeNull();
    expect(resolveMaxSyncProgramFiles({ CME_TYPE_FACT_MAX_SYNC_PROGRAM_FILES: "bad" })).toBe(500);
  });
});

function createWorkspaceWithTsFiles(count: number): string {
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), "cme-default-program-"));
  tempRoots.push(workspaceRoot);
  const srcRoot = path.join(workspaceRoot, "src");
  mkdirSync(srcRoot);
  writeFileSync(
    path.join(workspaceRoot, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { strict: true },
      include: ["src/**/*.ts"],
    }),
  );

  for (let index = 0; index < count; index++) {
    writeFileSync(path.join(srcRoot, `file-${index}.ts`), `export const value${index} = ${index};`);
  }

  return workspaceRoot;
}
