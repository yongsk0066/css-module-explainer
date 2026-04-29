import { spawnSync } from "node:child_process";
import { strict as assert } from "node:assert";
import { buildServerCapabilities } from "../server/lsp-server/src/server-capabilities";

interface RustOmenaLspServerBoundarySummary {
  readonly schemaVersion: string;
  readonly product: string;
  readonly migrationStatus: string;
  readonly capabilities: {
    readonly textDocumentSync: number;
    readonly definitionProvider: boolean;
    readonly hoverProvider: boolean;
    readonly completionProvider: {
      readonly triggerCharacters: readonly string[];
      readonly resolveProvider: boolean;
    };
    readonly codeActionProvider: {
      readonly codeActionKinds: readonly string[];
      readonly resolveProvider: boolean;
    };
    readonly referencesProvider: boolean;
    readonly codeLensProvider: {
      readonly resolveProvider: boolean;
    };
    readonly renameProvider: {
      readonly prepareProvider: boolean;
    };
    readonly workspace: {
      readonly workspaceFolders: {
        readonly supported: boolean;
        readonly changeNotifications: boolean;
      };
    };
  };
  readonly handlerSurfaces: readonly {
    readonly method: string;
    readonly migrationState: string;
  }[];
  readonly blockingWorkPolicy: readonly string[];
  readonly nextDecouplingTargets: readonly string[];
}

const rustSummary = readRustBoundarySummary();
const nodeCapabilities = buildServerCapabilities();

assert.equal(rustSummary.schemaVersion, "0");
assert.equal(rustSummary.product, "omena-lsp-server.boundary");
assert.equal(rustSummary.migrationStatus, "runtimeProviderParity");

assert.deepEqual(rustSummary.capabilities, nodeCapabilities);
assert.deepEqual(
  rustSummary.handlerSurfaces.map((surface) => surface.method).toSorted(),
  [
    "textDocument/codeAction",
    "textDocument/codeLens",
    "textDocument/completion",
    "textDocument/definition",
    "textDocument/didChange",
    "textDocument/didClose",
    "textDocument/didOpen",
    "textDocument/hover",
    "textDocument/prepareRename",
    "textDocument/publishDiagnostics",
    "textDocument/references",
    "textDocument/rename",
    "initialized",
    "workspace/didChangeConfiguration",
    "workspace/didChangeWatchedFiles",
    "workspace/didChangeWorkspaceFolders",
  ].toSorted(),
);
assert.ok(
  rustSummary.blockingWorkPolicy.includes("noFullWorkspaceProgramOnRequestPath"),
  "Rust LSP boundary must explicitly reject full workspace program work on request paths",
);
assert.ok(
  rustSummary.nextDecouplingTargets.includes("longLivedTsgoClient"),
  "Rust LSP boundary must keep the tsgo client migration visible",
);

process.stdout.write(
  [
    "validated omena-lsp-server boundary:",
    `handlers=${rustSummary.handlerSurfaces.length}`,
    `completionTriggers=${rustSummary.capabilities.completionProvider.triggerCharacters.length}`,
    `migration=${rustSummary.migrationStatus}`,
  ].join(" "),
);
process.stdout.write("\n");

function readRustBoundarySummary(): RustOmenaLspServerBoundarySummary {
  const result = spawnSync(
    "cargo",
    [
      "run",
      "--manifest-path",
      "rust/Cargo.toml",
      "-p",
      "omena-lsp-server",
      "--bin",
      "omena-lsp-server-boundary",
      "--quiet",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  assert.equal(
    result.status,
    0,
    [
      "omena-lsp-server boundary binary failed",
      result.error ? `error=${result.error.message}` : null,
      result.stderr.trim() ? `stderr=${result.stderr.trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return JSON.parse(result.stdout) as RustOmenaLspServerBoundarySummary;
}
