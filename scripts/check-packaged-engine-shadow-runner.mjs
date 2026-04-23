#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const binaryName =
  process.platform === "win32" ? "engine-shadow-runner.exe" : "engine-shadow-runner";
const runnerPath = path.join(
  repoRoot,
  "dist",
  "bin",
  `${process.platform}-${process.arch}`,
  binaryName,
);

if (!existsSync(runnerPath)) {
  throw new Error(`Missing packaged engine-shadow-runner at ${runnerPath}`);
}

const mode = "__packaged-runner-smoke__";
const child = spawnSync(runnerPath, [mode], {
  cwd: repoRoot,
  input: "{}",
  encoding: "utf8",
});

const stderr = child.stderr ?? "";
if (child.status === 0 || !stderr.includes(`unsupported engine-shadow-runner mode: ${mode}`)) {
  throw new Error(
    [
      "Packaged engine-shadow-runner smoke failed",
      `status=${child.status ?? "unknown"}`,
      stderr.trim() ? `stderr=${stderr.trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

const size = statSync(runnerPath).size;
console.log(
  `Packaged engine-shadow-runner ok: ${path.relative(repoRoot, runnerPath)} (${size} bytes)`,
);
