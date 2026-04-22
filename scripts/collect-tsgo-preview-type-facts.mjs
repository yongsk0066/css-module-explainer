import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-jsonrpc/node.js";

const UNRESOLVABLE = { kind: "unresolvable", values: [] };

async function main() {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const child = spawn(
    "pnpm",
    [
      "dlx",
      "@typescript/native-preview@beta",
      "--api",
      "--async",
      "--cwd",
      input.workspaceRoot,
      ...resolvePreviewCheckerArgs(),
    ],
    {
      cwd: input.workspaceRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    },
  );

  const stderr = [];
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => stderr.push(chunk));

  const connection = createMessageConnection(
    new StreamMessageReader(child.stdout),
    new StreamMessageWriter(child.stdin),
  );
  connection.listen();

  try {
    await connection.sendRequest("initialize");
    const snapshotResponse = await connection.sendRequest("updateSnapshot", {
      openProject: input.configPath,
    });
    const snapshot = snapshotResponse.snapshot;

    const projectByFile = new Map(
      await Promise.all(
        [...new Set(input.targets.map((target) => target.filePath))].map(async (filePath) => {
          const projectResponse = await connection.sendRequest("getDefaultProjectForFile", {
            snapshot,
            file: filePath,
          });
          return [filePath, projectResponse.id];
        }),
      ),
    );

    const results = await Promise.all(
      input.targets.map(async (target) => {
        const typeResponse = await connection.sendRequest("getTypeAtPosition", {
          snapshot,
          project: projectByFile.get(target.filePath),
          file: target.filePath,
          position: target.position,
        });
        const resolvedType = await extractResolvedType(connection, snapshot, typeResponse);
        return {
          filePath: target.filePath,
          expressionId: target.expressionId,
          resolvedType,
        };
      }),
    );

    await connection.sendRequest("release", { handle: snapshot });
    process.stdout.write(JSON.stringify(results));
  } finally {
    connection.dispose();
    child.kill();
    await waitForExit(child);
    if (child.exitCode && stderr.length > 0) {
      process.stderr.write(stderr.join(""));
    }
  }
}

async function extractResolvedType(connection, snapshot, typeResponse) {
  if (typeof typeResponse?.value === "string") {
    return { kind: "union", values: [typeResponse.value] };
  }

  if ((Number(typeResponse?.flags ?? 0) & ts.TypeFlags.Union) !== 0) {
    const members = await connection.sendRequest("getTypesOfType", {
      snapshot,
      type: typeResponse.id,
    });
    const resolvedMembers = await Promise.all(
      (members ?? []).map((member) => extractResolvedType(connection, snapshot, member)),
    );
    const values = [];
    for (const resolved of resolvedMembers) {
      if (resolved.kind !== "union" || resolved.values.length !== 1) {
        return UNRESOLVABLE;
      }
      values.push(resolved.values[0]);
    }

    const deduped = [...new Set(values)];
    return deduped.length > 0 ? { kind: "union", values: deduped } : UNRESOLVABLE;
  }

  return UNRESOLVABLE;
}

function waitForExit(child) {
  return new Promise((resolve) => {
    child.once("exit", () => resolve());
    child.once("close", () => resolve());
  });
}

function resolvePreviewCheckerArgs() {
  const value = process.env.CME_TSGO_PREVIEW_CHECKERS?.trim();
  if (!value) {
    return [];
  }
  return ["--checkers", value];
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
