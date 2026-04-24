import { spawn } from "node:child_process";
import { strict as assert } from "node:assert";

import type { Range } from "@css-module-explainer/shared";

import { parseStyleDocument } from "../server/engine-core-ts/src/core/scss/scss-parser";
import { deriveSassSummary, type ParserSassSeedFactsV0 } from "./rust-parser-sass-facts";

interface ParserParityLiteSummaryV0 {
  readonly schemaVersion: "0";
  readonly language: "css" | "scss" | "less";
}

interface ParserIndexSummaryV0 {
  readonly schemaVersion: "0";
  readonly language: "css" | "scss" | "less";
  readonly selectors: {
    readonly names: readonly string[];
    readonly bemSuffixParentNames: readonly string[];
    readonly nestedSafetyCounts: {
      readonly flat: number;
      readonly bemSuffixSafe: number;
      readonly nestedUnsafe: number;
    };
  };
  readonly values: {
    readonly declNames: readonly string[];
    readonly declNamesWithImportedRefs: readonly string[];
    readonly importNames: readonly string[];
    readonly importSources: readonly string[];
  };
  readonly keyframes: {
    readonly names: readonly string[];
    readonly animationRefNames: readonly string[];
    readonly animationNameRefNames: readonly string[];
  };
  readonly sass: ParserSassSeedFactsV0;
  readonly composes: {
    readonly importSources: readonly string[];
    readonly classNameCount: number;
    readonly importedClassNameCount: number;
  };
}

interface ParserEvaluatorCandidateV0 {
  readonly selectorName: string;
  readonly hasLocalValueRefs: boolean;
  readonly hasImportedValueRefs: boolean;
  readonly hasLocalComposes: boolean;
  readonly hasImportedComposes: boolean;
  readonly hasGlobalComposes: boolean;
}

interface ParserEvaluatorCandidatesV0 {
  readonly schemaVersion: "0";
  readonly language: "css" | "scss" | "less";
  readonly results: readonly ParserEvaluatorCandidateV0[];
}

interface ParserCanonicalCandidateBundleV0 {
  readonly schemaVersion: "0";
  readonly language: "css" | "scss" | "less";
  readonly parityLite: ParserParityLiteSummaryV0;
  readonly cssModulesIntermediate: ParserIndexSummaryV0;
}

interface ParserCanonicalProducerSignalV0 {
  readonly schemaVersion: "0";
  readonly language: "css" | "scss" | "less";
  readonly canonicalCandidate: ParserCanonicalCandidateBundleV0;
  readonly evaluatorCandidates: ParserEvaluatorCandidatesV0;
}

interface ParserConsumerBoundarySummaryV0 {
  readonly schemaVersion: "0";
  readonly language: "css" | "scss" | "less";
  readonly selectorUsage: {
    readonly names: readonly string[];
    readonly bemSuffixParentNames: readonly string[];
    readonly nestedSafetyCounts: {
      readonly flat: number;
      readonly bemSuffixSafe: number;
      readonly nestedUnsafe: number;
    };
  };
  readonly composesResolution: {
    readonly selectorsNeedingResolutionNames: readonly string[];
    readonly localSelectorNames: readonly string[];
    readonly importedSelectorNames: readonly string[];
    readonly globalSelectorNames: readonly string[];
    readonly importSources: readonly string[];
    readonly totalClassNameCount: number;
    readonly importedClassNameCount: number;
  };
  readonly valueResolution: {
    readonly declNames: readonly string[];
    readonly importNames: readonly string[];
    readonly importSources: readonly string[];
    readonly selectorsWithLocalRefsNames: readonly string[];
    readonly selectorsWithImportedRefsNames: readonly string[];
    readonly declNamesWithImportedRefs: readonly string[];
  };
  readonly keyframesResolution: {
    readonly declaredNames: readonly string[];
    readonly referencedNames: readonly string[];
    readonly missingCandidateNames: readonly string[];
  };
  readonly sassSymbolSeed: ParserSassSeedFactsV0;
}

const CORPUS = [
  {
    label: "css-basic-parser-consumer-boundary",
    filePath: "/f.module.css",
    source: `.btn { color: red; }`,
  },
  {
    label: "scss-media-keyframes-parser-consumer-boundary",
    filePath: "/f.module.scss",
    source: `@media (min-width: 1px) { @keyframes pulse { from { opacity: 0; } } .btn { animation: pulse 1s linear; animation-name: pulse; } }`,
  },
  {
    label: "scss-mixed-value-refs-parser-consumer-boundary",
    filePath: "/f.module.scss",
    source: `@supports (display: grid) { @layer ui { @value brand from "./tokens.module.scss"; @value accent: red; .btn { color: brand; background: accent; } } }`,
  },
  {
    label: "scss-mixed-composes-parser-consumer-boundary",
    filePath: "/f.module.scss",
    source: `@supports (display: grid) { @layer ui { .card { composes: base utility; composes: shell from global; composes: tone from "./base.module.scss"; } } }`,
  },
  {
    label: "scss-grouped-bem-unsafe-parser-consumer-boundary",
    filePath: "/f.module.scss",
    source: `.a, .b { &__icon { &--small { color: red; } } }`,
  },
  {
    label: "scss-sass-symbol-parser-consumer-boundary",
    filePath: "/f.module.scss",
    source: `@use "./plain";\n@use "./reset" as *;\n@use "./tokens" as tokens;\n@use "sass:color";\n@forward "./theme";\n@import "./legacy";\n$gap: 1rem;\n@mixin raised($depth) { box-shadow: 0 0 $depth black; }\n@function tone($value) { @return $value; }\n.btn { color: $gap; @include raised($gap); border-color: tone($gap); }`,
  },
] as const;

function findLangForPath(filePath: string): "scss" | "less" | "css" {
  if (filePath.endsWith(".module.scss")) return "scss";
  if (filePath.endsWith(".module.less")) return "less";
  return "css";
}

function comparePosition(
  left: { readonly line: number; readonly character: number },
  right: { readonly line: number; readonly character: number },
): number {
  if (left.line !== right.line) return left.line - right.line;
  return left.character - right.character;
}

function rangeContains(outer: Range, inner: Range): boolean {
  return (
    comparePosition(outer.start, inner.start) <= 0 && comparePosition(outer.end, inner.end) >= 0
  );
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].toSorted((left, right) => left.localeCompare(right));
}

function deriveSummaryFromProducer(
  producer: ParserCanonicalProducerSignalV0,
): ParserConsumerBoundarySummaryV0 {
  const intermediate = producer.canonicalCandidate.cssModulesIntermediate;
  const evaluator = producer.evaluatorCandidates.results;
  const referencedNames = uniqueSorted([
    ...intermediate.keyframes.animationRefNames,
    ...intermediate.keyframes.animationNameRefNames,
  ]);
  const declaredKeyframes = new Set(intermediate.keyframes.names);

  return {
    schemaVersion: "0",
    language: producer.language,
    selectorUsage: {
      names: [...intermediate.selectors.names],
      bemSuffixParentNames: [...intermediate.selectors.bemSuffixParentNames],
      nestedSafetyCounts: intermediate.selectors.nestedSafetyCounts,
    },
    composesResolution: {
      selectorsNeedingResolutionNames: uniqueSorted(
        evaluator
          .filter((candidate) => candidate.hasLocalComposes || candidate.hasImportedComposes)
          .map((candidate) => candidate.selectorName),
      ),
      localSelectorNames: uniqueSorted(
        evaluator
          .filter((candidate) => candidate.hasLocalComposes)
          .map((candidate) => candidate.selectorName),
      ),
      importedSelectorNames: uniqueSorted(
        evaluator
          .filter((candidate) => candidate.hasImportedComposes)
          .map((candidate) => candidate.selectorName),
      ),
      globalSelectorNames: uniqueSorted(
        evaluator
          .filter((candidate) => candidate.hasGlobalComposes)
          .map((candidate) => candidate.selectorName),
      ),
      importSources: [...intermediate.composes.importSources],
      totalClassNameCount: intermediate.composes.classNameCount,
      importedClassNameCount: intermediate.composes.importedClassNameCount,
    },
    valueResolution: {
      declNames: [...intermediate.values.declNames],
      importNames: [...intermediate.values.importNames],
      importSources: [...intermediate.values.importSources],
      selectorsWithLocalRefsNames: uniqueSorted(
        evaluator
          .filter((candidate) => candidate.hasLocalValueRefs)
          .map((candidate) => candidate.selectorName),
      ),
      selectorsWithImportedRefsNames: uniqueSorted(
        evaluator
          .filter((candidate) => candidate.hasImportedValueRefs)
          .map((candidate) => candidate.selectorName),
      ),
      declNamesWithImportedRefs: [...intermediate.values.declNamesWithImportedRefs],
    },
    keyframesResolution: {
      declaredNames: [...intermediate.keyframes.names],
      referencedNames,
      missingCandidateNames: referencedNames.filter((name) => !declaredKeyframes.has(name)),
    },
    sassSymbolSeed: intermediate.sass,
  };
}

function deriveTsSummary(filePath: string, source: string): ParserConsumerBoundarySummaryV0 {
  const document = parseStyleDocument(source, filePath);
  const localValueNames = new Set(document.valueDecls.map((entry) => entry.name));
  const importedValueNames = new Set(document.valueImports.map((entry) => entry.name));
  const referencedNames = uniqueSorted(document.animationNameRefs.map((entry) => entry.name));
  const declaredKeyframes = new Set(document.keyframes.map((entry) => entry.name));

  return {
    schemaVersion: "0",
    language: findLangForPath(filePath),
    selectorUsage: {
      names: document.selectors.map((selector) => selector.name).toSorted(),
      bemSuffixParentNames: uniqueSorted(
        document.selectors
          .map((selector) => selector.bemSuffix?.parentResolvedName)
          .filter((value): value is string => value !== undefined),
      ),
      nestedSafetyCounts: {
        flat: document.selectors.filter((selector) => selector.nestedSafety === "flat").length,
        bemSuffixSafe: document.selectors.filter(
          (selector) => selector.nestedSafety === "bemSuffixSafe",
        ).length,
        nestedUnsafe: document.selectors.filter(
          (selector) => selector.nestedSafety === "nestedUnsafe",
        ).length,
      },
    },
    composesResolution: {
      selectorsNeedingResolutionNames: uniqueSorted(
        document.selectors
          .filter((selector) =>
            selector.composes.some((ref) => ref.from === undefined && ref.fromGlobal !== true),
          )
          .map((selector) => selector.name)
          .concat(
            document.selectors
              .filter((selector) => selector.composes.some((ref) => ref.from !== undefined))
              .map((selector) => selector.name),
          ),
      ),
      localSelectorNames: uniqueSorted(
        document.selectors
          .filter((selector) =>
            selector.composes.some((ref) => ref.from === undefined && ref.fromGlobal !== true),
          )
          .map((selector) => selector.name),
      ),
      importedSelectorNames: uniqueSorted(
        document.selectors
          .filter((selector) => selector.composes.some((ref) => ref.from !== undefined))
          .map((selector) => selector.name),
      ),
      globalSelectorNames: uniqueSorted(
        document.selectors
          .filter((selector) => selector.composes.some((ref) => ref.fromGlobal === true))
          .map((selector) => selector.name),
      ),
      importSources: uniqueSorted(
        document.selectors.flatMap((selector) =>
          selector.composes
            .map((ref) => ref.from)
            .filter((value): value is string => value !== undefined),
        ),
      ),
      totalClassNameCount: document.selectors.reduce(
        (sum, selector) =>
          sum + selector.composes.reduce((inner, ref) => inner + ref.classNames.length, 0),
        0,
      ),
      importedClassNameCount: document.selectors.reduce(
        (sum, selector) =>
          sum +
          selector.composes.reduce(
            (inner, ref) => inner + (ref.from !== undefined ? ref.classNames.length : 0),
            0,
          ),
        0,
      ),
    },
    valueResolution: {
      declNames: document.valueDecls.map((entry) => entry.name).toSorted(),
      importNames: document.valueImports.map((entry) => entry.name).toSorted(),
      importSources: uniqueSorted(document.valueImports.map((entry) => entry.from)),
      selectorsWithLocalRefsNames: uniqueSorted(
        document.selectors
          .filter((selector) =>
            document.valueRefs.some(
              (entry) =>
                localValueNames.has(entry.name) && rangeContains(selector.ruleRange, entry.range),
            ),
          )
          .map((selector) => selector.name),
      ),
      selectorsWithImportedRefsNames: uniqueSorted(
        document.selectors
          .filter((selector) =>
            document.valueRefs.some(
              (entry) =>
                importedValueNames.has(entry.name) &&
                rangeContains(selector.ruleRange, entry.range),
            ),
          )
          .map((selector) => selector.name),
      ),
      declNamesWithImportedRefs: uniqueSorted(
        document.valueDecls
          .filter((decl) =>
            document.valueRefs.some(
              (entry) =>
                importedValueNames.has(entry.name) && rangeContains(decl.ruleRange, entry.range),
            ),
          )
          .map((decl) => decl.name),
      ),
    },
    keyframesResolution: {
      declaredNames: document.keyframes.map((entry) => entry.name).toSorted(),
      referencedNames,
      missingCandidateNames: referencedNames.filter((name) => !declaredKeyframes.has(name)),
    },
    sassSymbolSeed: deriveSassSummary(source),
  };
}

async function runRustJson<T>(bin: string, filePath: string, source: string): Promise<T> {
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
        bin,
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
        reject(new Error(`${bin} exited with ${code}\n${stderr}`));
        return;
      }
      resolve(JSON.parse(stdout) as T);
    });

    child.stdin.end(source);
  });
}

void (async () => {
  for (const entry of CORPUS) {
    process.stdout.write(`== rust-parser-consumer-boundary:${entry.label} ==\n`);

    // oxlint-disable-next-line eslint/no-await-in-loop
    const producer = await runRustJson<ParserCanonicalProducerSignalV0>(
      "engine-style-parser-canonical-producer",
      entry.filePath,
      entry.source,
    );
    const actual = deriveSummaryFromProducer(producer);
    const expected = deriveTsSummary(entry.filePath, entry.source);

    assert.deepEqual(
      actual,
      expected,
      [
        `parser consumer-boundary mismatch for ${entry.label}`,
        `expected: ${JSON.stringify(expected, null, 2)}`,
        `actual: ${JSON.stringify(actual, null, 2)}`,
      ].join("\n"),
    );

    process.stdout.write(
      `validated parser consumer-boundary: selectors=${actual.selectorUsage.names.length} composes=${actual.composesResolution.totalClassNameCount} valueImports=${actual.valueResolution.importNames.length} sassVars=${actual.sassSymbolSeed.variableDeclNames.length}\n\n`,
    );
  }
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
