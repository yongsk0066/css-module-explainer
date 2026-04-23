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

for (const entry of [
  "extension/package.json",
  "extension/dist/client/extension.js",
  "extension/dist/server/server.js",
  `extension/dist/bin/${platformDir}/${binaryName}`,
]) {
  assertEntry(entries, entry);
}

for (const prefix of [
  "extension/rust/",
  "extension/client/",
  "extension/test/",
  "extension/scripts/",
  "extension/server/engine-host-node/",
  "extension/server/lsp-server/",
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
