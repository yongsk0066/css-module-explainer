import { spawn } from "node:child_process";
import { strict as assert } from "node:assert";

import { parseStyleDocument } from "../server/engine-core-ts/src/core/scss/scss-parser";

interface ParserIndexSummaryV0 {
  readonly schemaVersion: "0";
  readonly language: "css" | "scss" | "less";
  readonly selectorNames: readonly string[];
  readonly bemSuffixParentNames: readonly string[];
  readonly bemSuffixSafeSelectorNames: readonly string[];
  readonly keyframesNames: readonly string[];
  readonly nestedUnsafeSelectorNames: readonly string[];
  readonly valueDeclNames: readonly string[];
  readonly valueImportNames: readonly string[];
  readonly valueRefNames: readonly string[];
  readonly animationRefNames: readonly string[];
  readonly animationNameRefNames: readonly string[];
  readonly valueImportAliasCount: number;
  readonly composesClassNameCount: number;
  readonly bemSuffixCount: number;
  readonly nestedSafetyCounts: {
    readonly flat: number;
    readonly bemSuffixSafe: number;
    readonly nestedUnsafe: number;
  };
}

const CORPUS = [
  {
    label: "scss-basic-index",
    filePath: "/f.module.scss",
    source: `.btn { color: red; }`,
  },
  {
    label: "scss-value-import-and-ref",
    filePath: "/f.module.scss",
    source: `@value brand from "./tokens.module.scss";\n.btn { color: brand; }`,
  },
  {
    label: "scss-value-import-alias-and-ref",
    filePath: "/f.module.scss",
    source: `@value brand as accent from "./tokens.module.scss";\n.btn { color: accent; }`,
  },
  {
    label: "scss-local-value-ref",
    filePath: "/f.module.scss",
    source: `@value brand: red;\n.btn { color: brand; }`,
  },
  {
    label: "scss-composes-and-animation",
    filePath: "/f.module.scss",
    source: `@keyframes fade { from { opacity: 0; } }\n.btn { composes: base primary from "./base.module.scss"; animation: fade 1s linear; animation-name: fade; }`,
  },
  {
    label: "scss-bem-safe-nested-index",
    filePath: "/f.module.scss",
    source: `.card { &__icon { &--small { color: red; } } }`,
  },
  {
    label: "scss-grouped-bem-unsafe-index",
    filePath: "/f.module.scss",
    source: `.a, .b { &__icon { &--small { color: red; } } }`,
  },
  {
    label: "scss-amp-class-unsafe-index",
    filePath: "/f.module.scss",
    source: `.btn { &.active { color: red; } }`,
  },
  {
    label: "scss-mixed-wrapper-index",
    filePath: "/f.module.scss",
    source: `@media (min-width: 1px) { @value brand from "./tokens.module.scss"; .btn:hover { color: brand; } }`,
  },
] as const;

function deriveTsSummary(filePath: string, source: string): ParserIndexSummaryV0 {
  const document = parseStyleDocument(source, filePath);
  return {
    schemaVersion: "0",
    language: filePath.endsWith(".module.less")
      ? "less"
      : filePath.endsWith(".module.scss")
        ? "scss"
        : "css",
    selectorNames: [...document.selectors].map((selector) => selector.name).toSorted(),
    bemSuffixParentNames: document.selectors
      .map((selector) => selector.bemSuffix?.parentResolvedName)
      .filter((name): name is string => name !== undefined)
      .toSorted(),
    bemSuffixSafeSelectorNames: document.selectors
      .filter((selector) => selector.nestedSafety === "bemSuffixSafe")
      .map((selector) => selector.name)
      .toSorted(),
    keyframesNames: [...document.keyframes].map((entry) => entry.name).toSorted(),
    nestedUnsafeSelectorNames: document.selectors
      .filter((selector) => selector.nestedSafety === "nestedUnsafe")
      .map((selector) => selector.name)
      .toSorted(),
    valueDeclNames: [...document.valueDecls].map((entry) => entry.name).toSorted(),
    valueImportNames: [...document.valueImports].map((entry) => entry.name).toSorted(),
    valueRefNames: [...document.valueRefs].map((entry) => entry.name).toSorted(),
    animationRefNames: document.animationNameRefs
      .filter((entry) => entry.property === "animation")
      .map((entry) => entry.name)
      .toSorted(),
    animationNameRefNames: document.animationNameRefs
      .filter((entry) => entry.property === "animation-name")
      .map((entry) => entry.name)
      .toSorted(),
    valueImportAliasCount: document.valueImports.filter(
      (entry) => entry.importedName !== entry.name,
    ).length,
    composesClassNameCount: document.selectors.reduce(
      (sum, selector) =>
        sum + selector.composes.reduce((inner, ref) => inner + ref.classNames.length, 0),
      0,
    ),
    bemSuffixCount: document.selectors.filter((selector) => selector.bemSuffix).length,
    nestedSafetyCounts: {
      flat: document.selectors.filter((selector) => selector.nestedSafety === "flat").length,
      bemSuffixSafe: document.selectors.filter(
        (selector) => selector.nestedSafety === "bemSuffixSafe",
      ).length,
      nestedUnsafe: document.selectors.filter(
        (selector) => selector.nestedSafety === "nestedUnsafe",
      ).length,
    },
  };
}

async function runRustSummary(filePath: string, source: string): Promise<ParserIndexSummaryV0> {
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
        "engine-style-parser-index-summary",
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
        reject(new Error(`engine-style-parser-index-summary exited with ${code}\n${stderr}`));
        return;
      }
      resolve(JSON.parse(stdout) as ParserIndexSummaryV0);
    });

    child.stdin.end(source);
  });
}

void (async () => {
  for (const entry of CORPUS) {
    process.stdout.write(`== rust-parser-index-bridge:${entry.label} ==\n`);
    const expected = deriveTsSummary(entry.filePath, entry.source);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const actual = await runRustSummary(entry.filePath, entry.source);

    assert.deepEqual(
      actual,
      expected,
      [
        `parser index bridge mismatch for ${entry.label}`,
        `expected: ${JSON.stringify(expected, null, 2)}`,
        `actual: ${JSON.stringify(actual, null, 2)}`,
      ].join("\n"),
    );

    process.stdout.write(
      `matched index summary: selectors=${actual.selectorNames.length} valueImports=${actual.valueImportNames.length} valueRefs=${actual.valueRefNames.length} composes=${actual.composesClassNameCount}\n\n`,
    );
  }
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
