import { readFileSync } from "node:fs";
import path from "node:path";
import { strict as assert } from "node:assert";

const RUNNER_PATH = path.join(process.cwd(), "rust/crates/engine-shadow-runner/src/main.rs");
const QUERY_PATH = path.join(process.cwd(), "rust/crates/omena-query/src/lib.rs");

const runnerSource = readFileSync(RUNNER_PATH, "utf8");
const querySource = readFileSync(QUERY_PATH, "utf8");
const commandBodies = extractCommandBodies(runnerSource);

const resolverBoundaryBody = commandBodies.get("input-omena-resolver-boundary");
assert.ok(
  resolverBoundaryBody,
  "missing engine-shadow-runner command arm: input-omena-resolver-boundary",
);
assert.ok(
  resolverBoundaryBody.includes("summarize_omena_resolver_boundary"),
  "input-omena-resolver-boundary must route through omena-resolver",
);

assert.ok(
  querySource.includes("summarize_omena_resolver_query_fragments(input)"),
  "omena-query source-resolution query fragments must route through omena-resolver",
);
assert.ok(
  querySource.includes("summarize_omena_resolver_canonical_producer_signal(input)"),
  "omena-query source-resolution canonical producer must route through omena-resolver",
);

process.stdout.write(
  [
    "validated omena-resolver runner boundary:",
    "resolverBoundaryCommand=input-omena-resolver-boundary",
    "queryDelegation=source-resolution",
  ].join(" "),
);
process.stdout.write("\n");

function extractCommandBodies(source: string): Map<string, string> {
  const commandMatches = [...source.matchAll(/Some\("([^"]+)"\)\s*=>\s*\{/g)];
  const bodies = new Map<string, string>();

  for (const match of commandMatches) {
    const command = match[1];
    const bodyStart = match.index === undefined ? -1 : match.index + match[0].length;
    if (!command || bodyStart < 0) continue;
    bodies.set(command, readBraceBody(source, bodyStart));
  }

  return bodies;
}

function readBraceBody(source: string, bodyStart: number): string {
  let depth = 1;
  let index = bodyStart;
  while (index < source.length && depth > 0) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    index += 1;
  }
  return source.slice(bodyStart, index - 1);
}
