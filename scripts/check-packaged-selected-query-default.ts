import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import {
  isPackagedExtensionRuntime,
  resolveSelectedQueryBackendKind,
} from "../server/engine-host-node/src/selected-query-backend";

const repoRoot = process.cwd();
const vsixFiles = readdirSync(repoRoot).filter((file) => file.endsWith(".vsix"));
if (vsixFiles.length !== 1) {
  throw new Error(`Expected exactly one VSIX in ${repoRoot}, found ${vsixFiles.length}`);
}

const vsixFile = vsixFiles[0]!;
const vsixPath = path.join(repoRoot, vsixFile);
const entries = readVsixEntries(vsixPath);
const platformDir = `${process.platform}-${process.arch}`;
const binaryName =
  process.platform === "win32" ? "engine-shadow-runner.exe" : "engine-shadow-runner";
const minimumRunnerTargets = Number.parseInt(
  process.env.CME_PACKAGED_RUNNER_MIN_TARGETS ?? "1",
  10,
);
const requiredRunnerPlatforms = (process.env.CME_PACKAGED_RUNNER_REQUIRED_PLATFORMS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (!Number.isInteger(minimumRunnerTargets) || minimumRunnerTargets < 1) {
  throw new Error(
    `CME_PACKAGED_RUNNER_MIN_TARGETS must be a positive integer, got ${process.env.CME_PACKAGED_RUNNER_MIN_TARGETS}`,
  );
}

for (const entry of [
  "extension/package.json",
  "extension/dist/client/extension.js",
  "extension/dist/server/server.js",
  `extension/dist/bin/${platformDir}/${binaryName}`,
]) {
  assertEntry(entries, entry);
}

const runnerTargets = readPackagedRunnerTargets(entries);
if (runnerTargets.length < minimumRunnerTargets) {
  throw new Error(
    `Expected at least ${minimumRunnerTargets} packaged runner target(s), found ${runnerTargets.length}: ${runnerTargets.join(", ")}`,
  );
}

for (const platform of requiredRunnerPlatforms) {
  if (!runnerTargets.some((target) => target.startsWith(`${platform}-`))) {
    throw new Error(
      `VSIX is missing packaged runner for required platform ${platform}; found ${runnerTargets.join(", ")}`,
    );
  }
}

for (const prefix of [
  "extension/rust/",
  "extension/client/",
  "extension/test/",
  "extension/scripts/",
  "extension/server/engine-host-node/",
  "extension/server/lsp-server/",
  "extension/.runner-artifacts/",
]) {
  assertNoPrefix(entries, prefix);
}

const packagedRoot = path.join(path.parse(repoRoot).root, "extension");
const fileExists = (filePath: string): boolean => {
  const relative = path.relative(packagedRoot, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return false;
  return entries.has(`extension/${toPosixPath(relative)}`);
};
const packagedEnv = { CME_PROJECT_ROOT: packagedRoot } as NodeJS.ProcessEnv;

if (!isPackagedExtensionRuntime(packagedEnv, fileExists)) {
  throw new Error("VSIX file set did not satisfy packaged extension runtime detection");
}

const defaultBackend = resolveSelectedQueryBackendKind(packagedEnv, fileExists);
if (defaultBackend !== "rust-selected-query") {
  throw new Error(`Expected packaged default backend rust-selected-query, got ${defaultBackend}`);
}

const autoBackend = resolveSelectedQueryBackendKind(
  { ...packagedEnv, CME_SELECTED_QUERY_BACKEND: "auto" },
  fileExists,
);
if (autoBackend !== "rust-selected-query") {
  throw new Error(`Expected packaged auto backend rust-selected-query, got ${autoBackend}`);
}

const explicitTypescriptBackend = resolveSelectedQueryBackendKind(
  { ...packagedEnv, CME_SELECTED_QUERY_BACKEND: "typescript-current" },
  fileExists,
);
if (explicitTypescriptBackend !== "typescript-current") {
  throw new Error(
    `Expected explicit typescript-current override to win, got ${explicitTypescriptBackend}`,
  );
}

console.log(`Packaged selected-query default ok: ${vsixFile} -> ${defaultBackend}`);

function readVsixEntries(filePath: string): ReadonlySet<string> {
  const output = execFileSync("unzip", ["-Z1", filePath], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return new Set(output.split(/\r?\n/u).filter(Boolean));
}

function readPackagedRunnerTargets(vsixEntries: ReadonlySet<string>): readonly string[] {
  const targetDirs = new Set<string>();
  for (const entry of vsixEntries) {
    const match = /^extension\/dist\/bin\/([^/]+)\/engine-shadow-runner(?:\.exe)?$/u.exec(entry);
    if (match) targetDirs.add(match[1]!);
  }
  return [...targetDirs].toSorted();
}

function assertEntry(vsixEntries: ReadonlySet<string>, entry: string): void {
  if (!vsixEntries.has(entry)) {
    throw new Error(`VSIX is missing required entry: ${entry}`);
  }
}

function assertNoPrefix(vsixEntries: ReadonlySet<string>, prefix: string): void {
  const match = [...vsixEntries].find((entry) => entry.startsWith(prefix));
  if (match) {
    throw new Error(`VSIX unexpectedly includes checkout-only entry: ${match}`);
  }
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}
