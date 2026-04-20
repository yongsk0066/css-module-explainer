import { spawn } from "node:child_process";
import { strict as assert } from "node:assert";

import { parseStyleDocument } from "../server/engine-core-ts/src/core/scss/scss-parser";

interface ParserParityLiteSummaryV0 {
  readonly schemaVersion: "0";
  readonly language: "css" | "scss" | "less";
  readonly selectorNames: readonly string[];
  readonly keyframesNames: readonly string[];
  readonly valueDeclNames: readonly string[];
  readonly diagnosticCount: number;
}

const CORPUS = [
  {
    label: "scss-leading-comment",
    filePath: "/f.module.scss",
    source: `// leading comment\n.btn { color: red; }`,
  },
  {
    label: "scss-media-wrapper",
    filePath: "/f.module.scss",
    source: `@media (min-width: 600px) {\n  .btn { font-size: 16px; }\n}`,
  },
  {
    label: "scss-value-and-keyframes",
    filePath: "/f.module.scss",
    source: `@value brand: red;\n@keyframes fade { from { opacity: 0; } }\n.btn { color: brand; }`,
  },
  {
    label: "scss-bem-nested",
    filePath: "/f.module.scss",
    source: `.card { &__icon { &--small { color: red; } } }`,
  },
  {
    label: "scss-grouped-bem-nested",
    filePath: "/f.module.scss",
    source: `.a, .b { &__icon { &--small { color: red; } } }`,
  },
  {
    label: "scss-grouped-active",
    filePath: "/f.module.scss",
    source: `.a, .b { &.active { color: red; } }`,
  },
  {
    label: "scss-pseudo",
    filePath: "/f.module.scss",
    source: `.btn:hover { color: red; }`,
  },
  {
    label: "scss-compound-class",
    filePath: "/f.module.scss",
    source: `.btn.active { color: red; }`,
  },
  {
    label: "scss-combinator-rightmost",
    filePath: "/f.module.scss",
    source: `.a > .b { color: red; }`,
  },
  {
    label: "scss-layer-wrapper",
    filePath: "/f.module.scss",
    source: `@layer ui { .btn:hover { color: red; } }`,
  },
  {
    label: "scss-descendant-rightmost",
    filePath: "/f.module.scss",
    source: `.a .b { color: red; }`,
  },
  {
    label: "scss-pseudo-function-is",
    filePath: "/f.module.scss",
    source: `.btn:is(.active, .primary) { color: red; }`,
  },
  {
    label: "scss-global-function",
    filePath: "/f.module.scss",
    source: `:global(.foo) { color: red; }`,
  },
  {
    label: "scss-local-function",
    filePath: "/f.module.scss",
    source: `:local(.foo) { color: red; }`,
  },
  {
    label: "scss-pseudo-function-not",
    filePath: "/f.module.scss",
    source: `.btn:not(.disabled) { color: red; }`,
  },
  {
    label: "scss-wrapper-mixed",
    filePath: "/f.module.scss",
    source: `@media (min-width: 1px) { @value brand: red; @keyframes fade { from { opacity: 0; } } .btn:hover { color: brand; } }`,
  },
  {
    label: "scss-supports-layer",
    filePath: "/f.module.scss",
    source: `@supports (display: grid) { @layer ui { .grid > .item { display: grid; } } }`,
  },
  {
    label: "less-variable",
    filePath: "/f.module.less",
    source: `@color: red;\n.btn { color: @color; }`,
  },
  {
    label: "css-basic",
    filePath: "/f.module.css",
    source: `.btn { color: red; }\n.link { color: blue; }`,
  },
] as const;

function deriveTsSummary(filePath: string, source: string): ParserParityLiteSummaryV0 {
  const document = parseStyleDocument(source, filePath);
  return {
    schemaVersion: "0",
    language: filePath.endsWith(".module.less")
      ? "less"
      : filePath.endsWith(".module.scss")
        ? "scss"
        : "css",
    selectorNames: [...document.selectors].map((selector) => selector.name).sort(),
    keyframesNames: [...document.keyframes].map((entry) => entry.name).sort(),
    valueDeclNames: [...document.valueDecls].map((entry) => entry.name).sort(),
    diagnosticCount: 0,
  };
}

async function runRustSummary(filePath: string, source: string): Promise<ParserParityLiteSummaryV0> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "cargo",
      [
        "run",
        "--quiet",
        "--manifest-path",
        "rust/Cargo.toml",
        "-p",
        "engine-style-parser",
        "--bin",
        "engine-style-parser-summary",
        "--",
        filePath,
      ],
      {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`engine-style-parser-summary exited with ${code}\n${stderr}`));
        return;
      }
      resolve(JSON.parse(stdout) as ParserParityLiteSummaryV0);
    });

    child.stdin.end(source);
  });
}

void (async () => {
  for (const entry of CORPUS) {
    process.stdout.write(`== rust-parser-parity-lite:${entry.label} ==\n`);
    const expected = deriveTsSummary(entry.filePath, entry.source);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const actual = await runRustSummary(entry.filePath, entry.source);

    assert.deepEqual(
      actual,
      expected,
      [
        `parser parity-lite mismatch for ${entry.label}`,
        `expected: ${JSON.stringify(expected, null, 2)}`,
        `actual: ${JSON.stringify(actual, null, 2)}`,
      ].join("\n"),
    );

    process.stdout.write(
      `matched parser summary: selectors=${actual.selectorNames.length} keyframes=${actual.keyframesNames.length} values=${actual.valueDeclNames.length}\n\n`,
    );
  }
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
