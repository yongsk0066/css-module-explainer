import { spawnSync } from "node:child_process";
import path from "node:path";
import ts from "typescript";
import type { ResolvedType } from "@css-module-explainer/shared";
import {
  createTypeFactTableEntryV1,
  createTypeFactTableEntryV2,
  type TypeFactTableV1,
  type TypeFactTableV2,
} from "../../engine-core-ts/src/contracts";
import {
  collectTypeFactTableV1,
  type CollectTypeFactTableV1Options,
} from "./historical/type-fact-table-v1";
import { collectTypeFactTableV2 } from "./type-fact-table-v2";

const UNRESOLVABLE: ResolvedType = { kind: "unresolvable", values: [] };

export interface TsgoTypeFactTarget {
  readonly filePath: string;
  readonly expressionId: string;
  readonly position: number;
}

export interface TsgoTypeFactWorkerInput {
  readonly workspaceRoot: string;
  readonly configPath: string;
  readonly targets: readonly TsgoTypeFactTarget[];
}

export interface TsgoTypeFactWorkerResultEntry {
  readonly filePath: string;
  readonly expressionId: string;
  readonly resolvedType: ResolvedType;
}

export type RunTsgoTypeFactWorker = (
  input: TsgoTypeFactWorkerInput,
) => readonly TsgoTypeFactWorkerResultEntry[];

export interface CollectTsgoTypeFactsOptions extends CollectTypeFactTableV1Options {
  readonly findConfigFile?: (workspaceRoot: string) => string | null;
  readonly runWorker?: RunTsgoTypeFactWorker;
}

export function collectTypeFactTableV1WithTsgo(
  options: CollectTsgoTypeFactsOptions,
): TypeFactTableV1 {
  const resolvedTypes = collectTsgoResolvedTypes(options);
  if (!resolvedTypes) {
    return collectTypeFactTableV1(options);
  }

  return options.sourceEntries
    .flatMap(({ document, analysis }) =>
      analysis.sourceDocument.classExpressions.flatMap((expression) => {
        if (expression.kind !== "symbolRef") return [];
        return [
          createTypeFactTableEntryV1(
            document.filePath,
            expression.id,
            resolvedTypes.get(typeFactKey(document.filePath, expression.id)) ?? UNRESOLVABLE,
          ),
        ];
      }),
    )
    .toSorted(
      (a, b) =>
        a.filePath.localeCompare(b.filePath) || a.expressionId.localeCompare(b.expressionId),
    );
}

export function collectTypeFactTableV2WithTsgo(
  options: CollectTsgoTypeFactsOptions,
): TypeFactTableV2 {
  let resolvedTypes: Map<string, ResolvedType> | null;
  try {
    resolvedTypes = collectTsgoResolvedTypes(options);
  } catch (error) {
    if (!isTsgoProjectMissError(error)) {
      throw error;
    }
    return collectTypeFactTableV2(options);
  }
  if (!resolvedTypes) {
    return collectTypeFactTableV2(options);
  }

  return options.sourceEntries
    .flatMap(({ document, analysis }) =>
      analysis.sourceDocument.classExpressions.flatMap((expression) => {
        if (expression.kind !== "symbolRef") return [];
        return [
          createTypeFactTableEntryV2(
            document.filePath,
            expression.id,
            resolvedTypes.get(typeFactKey(document.filePath, expression.id)) ?? UNRESOLVABLE,
          ),
        ];
      }),
    )
    .toSorted(
      (a, b) =>
        a.filePath.localeCompare(b.filePath) || a.expressionId.localeCompare(b.expressionId),
    );
}

function collectTsgoResolvedTypes(
  options: CollectTsgoTypeFactsOptions,
): Map<string, ResolvedType> | null {
  const findConfigFile =
    options.findConfigFile ??
    ((workspaceRoot: string) => ts.findConfigFile(workspaceRoot, ts.sys.fileExists) ?? null);
  const configPath = findConfigFile(options.workspaceRoot);
  if (!configPath) {
    return null;
  }

  const targets = options.sourceEntries.flatMap(({ document, analysis }) =>
    analysis.sourceDocument.classExpressions.flatMap((expression) => {
      if (expression.kind !== "symbolRef") return [];
      return [
        {
          filePath: document.filePath,
          expressionId: expression.id,
          position: offsetAtPosition(
            document.content,
            expression.range.start.line,
            expression.range.start.character,
          ),
        } satisfies TsgoTypeFactTarget,
      ];
    }),
  );

  if (targets.length === 0) {
    return new Map();
  }

  const runWorker = options.runWorker ?? defaultRunTsgoTypeFactWorker;
  const resolved = runWorker({
    workspaceRoot: options.workspaceRoot,
    configPath,
    targets,
  });

  return new Map(
    resolved.map((entry) => [typeFactKey(entry.filePath, entry.expressionId), entry.resolvedType]),
  );
}

function defaultRunTsgoTypeFactWorker(
  input: TsgoTypeFactWorkerInput,
): readonly TsgoTypeFactWorkerResultEntry[] {
  const workerPath = path.join(process.cwd(), "scripts/collect-tsgo-type-facts.mjs");
  const child = spawnSync(process.execPath, [workerPath], {
    cwd: input.workspaceRoot,
    input: JSON.stringify(input),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  });

  if (child.status !== 0) {
    throw new Error(
      [
        "tsgo type fact worker failed",
        child.error ? `error: ${child.error.message}` : null,
        child.stderr.trim() ? `stderr: ${child.stderr.trim()}` : null,
        child.stdout.trim() ? `stdout: ${child.stdout.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return JSON.parse(child.stdout) as readonly TsgoTypeFactWorkerResultEntry[];
}

function isTsgoProjectMissError(error: unknown): boolean {
  return error instanceof Error && /\bno project found for file\b/u.test(error.message);
}

function offsetAtPosition(text: string, line: number, character: number): number {
  let offset = 0;
  let currentLine = 0;

  while (currentLine < line && offset < text.length) {
    const newline = text.indexOf("\n", offset);
    if (newline < 0) {
      return text.length;
    }
    offset = newline + 1;
    currentLine += 1;
  }

  return offset + character;
}

function typeFactKey(filePath: string, expressionId: string): string {
  return `${filePath}::${expressionId}`;
}
