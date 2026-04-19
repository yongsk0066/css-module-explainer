import { spawn } from "node:child_process";
import path from "node:path";
import type { EngineParitySnapshotV2 } from "../server/engine-host-node/src/engine-parity-v2";
import type { EngineInputV2, QueryResultV2 } from "../server/engine-core-ts/src/contracts";

const REPO_ROOT = process.cwd();
const RUST_MANIFEST = path.join(REPO_ROOT, "rust/Cargo.toml");

export interface ShadowSummaryV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly sourceCount: number;
  readonly styleCount: number;
  readonly typeFactCount: number;
  readonly distinctFactFiles: number;
  readonly byKind: Readonly<Record<string, number>>;
  readonly constrainedKinds: Readonly<Record<string, number>>;
  readonly finiteValueCount: number;
  readonly queryResultCount: number;
  readonly queryKindCounts: Readonly<Record<string, number>>;
  readonly expressionValueDomainKinds: Readonly<Record<string, number>>;
  readonly expressionValueConstraintKinds: Readonly<Record<string, number>>;
  readonly expressionConstraintDetailCounts: ConstraintDetailCounts;
  readonly expressionValueCertaintyShapes: Readonly<Record<string, number>>;
  readonly expressionSelectorCertaintyShapes: Readonly<Record<string, number>>;
  readonly resolutionValueConstraintKinds: Readonly<Record<string, number>>;
  readonly resolutionConstraintDetailCounts: ConstraintDetailCounts;
  readonly resolutionValueCertaintyShapes: Readonly<Record<string, number>>;
  readonly resolutionSelectorCertaintyShapes: Readonly<Record<string, number>>;
  readonly selectorUsageReferencedCount: number;
  readonly selectorUsageUnreferencedCount: number;
  readonly selectorUsageTotalReferences: number;
  readonly selectorUsageDirectReferences: number;
  readonly selectorUsageEditableDirectReferences: number;
  readonly selectorUsageExactReferences: number;
  readonly selectorUsageInferredOrBetterReferences: number;
  readonly selectorUsageExpandedCount: number;
  readonly selectorUsageStyleDependencyCount: number;
  readonly expectedExpressionSemanticsCount: number;
  readonly expectedSourceExpressionResolutionCount: number;
  readonly expectedSelectorUsageCount: number;
  readonly expectedTotalQueryCount: number;
  readonly matchedExpressionQueryPairs: number;
  readonly missingExpressionSemanticsCount: number;
  readonly missingSourceExpressionResolutionCount: number;
  readonly unexpectedExpressionSemanticsCount: number;
  readonly unexpectedSourceExpressionResolutionCount: number;
  readonly matchedSelectorUsageCount: number;
  readonly missingSelectorUsageCount: number;
  readonly unexpectedSelectorUsageCount: number;
  readonly rewritePlanCount: number;
  readonly checkerWarningCount: number;
  readonly checkerHintCount: number;
  readonly checkerTotalFindings: number;
}

export interface TypeFactInputSummaryV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly typeFactCount: number;
  readonly distinctFactFiles: number;
  readonly byKind: Readonly<Record<string, number>>;
  readonly constrainedKinds: Readonly<Record<string, number>>;
  readonly finiteValueCount: number;
}

export async function runShadow(snapshot: unknown): Promise<ShadowSummaryV0> {
  return runShadowJson<ShadowSummaryV0>([], snapshot);
}

export async function runShadowTypeFactInput(
  input: EngineInputV2,
): Promise<TypeFactInputSummaryV0> {
  return runShadowJson<TypeFactInputSummaryV0>(["input-type-facts"], input);
}

function runShadowJson<T>(args: string[], payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "cargo",
      [
        "run",
        "--manifest-path",
        RUST_MANIFEST,
        "-p",
        "engine-shadow-runner",
        "--quiet",
        "--",
        ...args,
      ],
      {
        cwd: REPO_ROOT,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    const stdout: string[] = [];
    const stderr: string[] = [];
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            [`engine-shadow-runner exited with code ${code}`, stderr.join("").trim()]
              .filter(Boolean)
              .join("\n"),
          ),
        );
        return;
      }

      try {
        resolve(JSON.parse(stdout.join("")) as T);
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.end(JSON.stringify(payload));
  });
}

export function deriveTsShadowSummary(snapshot: EngineParitySnapshotV2): ShadowSummaryV0 {
  const byKind: Record<string, number> = {};
  const constrainedKinds: Record<string, number> = {};
  const queryKindCounts: Record<string, number> = {};
  const expressionValueDomainKinds: Record<string, number> = {};
  const expressionValueConstraintKinds: Record<string, number> = {};
  const expressionConstraintDetailCounts = createConstraintDetailCounts();
  const expressionValueCertaintyShapes: Record<string, number> = {};
  const expressionSelectorCertaintyShapes: Record<string, number> = {};
  const resolutionValueConstraintKinds: Record<string, number> = {};
  const resolutionConstraintDetailCounts = createConstraintDetailCounts();
  const resolutionValueCertaintyShapes: Record<string, number> = {};
  const resolutionSelectorCertaintyShapes: Record<string, number> = {};
  const distinctFactFiles = new Set<string>();
  let finiteValueCount = 0;
  let selectorUsageReferencedCount = 0;
  let selectorUsageUnreferencedCount = 0;
  let selectorUsageTotalReferences = 0;
  let selectorUsageDirectReferences = 0;
  let selectorUsageEditableDirectReferences = 0;
  let selectorUsageExactReferences = 0;
  let selectorUsageInferredOrBetterReferences = 0;
  let selectorUsageExpandedCount = 0;
  let selectorUsageStyleDependencyCount = 0;
  let expectedExpressionSemanticsCount = 0;
  let expectedSourceExpressionResolutionCount = 0;
  let expectedSelectorUsageCount = 0;
  const expectedExpressionIds = new Set<string>();
  const expectedSelectorUsageIds = new Set<string>();
  const expressionSemanticsIds = new Set<string>();
  const resolutionIds = new Set<string>();
  const selectorUsageIds = new Set<string>();

  for (const source of snapshot.input.sources) {
    expectedExpressionSemanticsCount += source.document.classExpressions.length;
    for (const expression of source.document.classExpressions) {
      expectedExpressionIds.add(expression.id);
    }
  }
  expectedSourceExpressionResolutionCount = expectedExpressionSemanticsCount;
  for (const style of snapshot.input.styles) {
    expectedSelectorUsageCount += style.document.selectors.filter(
      (selector) => selector.viewKind === "canonical",
    ).length;
    for (const selector of style.document.selectors) {
      if (selector.viewKind === "canonical") {
        expectedSelectorUsageIds.add(selector.canonicalName);
      }
    }
  }

  for (const entry of snapshot.input.typeFacts) {
    distinctFactFiles.add(entry.filePath);
    byKind[entry.facts.kind] = (byKind[entry.facts.kind] ?? 0) + 1;

    if (entry.facts.kind === "finiteSet") {
      finiteValueCount += entry.facts.values.length;
    }

    if (entry.facts.kind === "constrained") {
      constrainedKinds[entry.facts.constraintKind] =
        (constrainedKinds[entry.facts.constraintKind] ?? 0) + 1;
    }
  }

  for (const query of snapshot.output.queryResults) {
    queryKindCounts[query.kind] = (queryKindCounts[query.kind] ?? 0) + 1;
    collectQueryPayloadSummary(
      query,
      expressionValueDomainKinds,
      expressionValueConstraintKinds,
      expressionConstraintDetailCounts,
      expressionValueCertaintyShapes,
      expressionSelectorCertaintyShapes,
      resolutionValueConstraintKinds,
      resolutionConstraintDetailCounts,
      resolutionValueCertaintyShapes,
      resolutionSelectorCertaintyShapes,
      expressionSemanticsIds,
      resolutionIds,
      selectorUsageIds,
      (payload) => {
        selectorUsageTotalReferences += payload.totalReferences;
        selectorUsageDirectReferences += payload.directReferenceCount;
        selectorUsageEditableDirectReferences += payload.editableDirectReferenceCount;
        selectorUsageExactReferences += payload.exactReferenceCount;
        selectorUsageInferredOrBetterReferences += payload.inferredOrBetterReferenceCount;
        if (payload.hasExpandedReferences) {
          selectorUsageExpandedCount += 1;
        }
        if (payload.hasStyleDependencyReferences) {
          selectorUsageStyleDependencyCount += 1;
        }
        const used = payload.hasAnyReferences;
        if (used) {
          selectorUsageReferencedCount += 1;
        } else {
          selectorUsageUnreferencedCount += 1;
        }
      },
    );
  }

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    sourceCount: snapshot.input.sources.length,
    styleCount: snapshot.input.styles.length,
    typeFactCount: snapshot.input.typeFacts.length,
    distinctFactFiles: distinctFactFiles.size,
    byKind,
    constrainedKinds,
    finiteValueCount,
    queryResultCount: snapshot.output.queryResults.length,
    queryKindCounts,
    expressionValueDomainKinds,
    expressionValueConstraintKinds,
    expressionConstraintDetailCounts,
    expressionValueCertaintyShapes,
    expressionSelectorCertaintyShapes,
    resolutionValueConstraintKinds,
    resolutionConstraintDetailCounts,
    resolutionValueCertaintyShapes,
    resolutionSelectorCertaintyShapes,
    selectorUsageReferencedCount,
    selectorUsageUnreferencedCount,
    selectorUsageTotalReferences,
    selectorUsageDirectReferences,
    selectorUsageEditableDirectReferences,
    selectorUsageExactReferences,
    selectorUsageInferredOrBetterReferences,
    selectorUsageExpandedCount,
    selectorUsageStyleDependencyCount,
    expectedExpressionSemanticsCount,
    expectedSourceExpressionResolutionCount,
    expectedSelectorUsageCount,
    expectedTotalQueryCount:
      expectedExpressionSemanticsCount +
      expectedSourceExpressionResolutionCount +
      expectedSelectorUsageCount,
    matchedExpressionQueryPairs: [...expectedExpressionIds].filter(
      (id) => expressionSemanticsIds.has(id) && resolutionIds.has(id),
    ).length,
    missingExpressionSemanticsCount: [...expectedExpressionIds].filter(
      (id) => !expressionSemanticsIds.has(id),
    ).length,
    missingSourceExpressionResolutionCount: [...expectedExpressionIds].filter(
      (id) => !resolutionIds.has(id),
    ).length,
    unexpectedExpressionSemanticsCount: [...expressionSemanticsIds].filter(
      (id) => !expectedExpressionIds.has(id),
    ).length,
    unexpectedSourceExpressionResolutionCount: [...resolutionIds].filter(
      (id) => !expectedExpressionIds.has(id),
    ).length,
    matchedSelectorUsageCount: [...expectedSelectorUsageIds].filter((id) =>
      selectorUsageIds.has(id),
    ).length,
    missingSelectorUsageCount: [...expectedSelectorUsageIds].filter(
      (id) => !selectorUsageIds.has(id),
    ).length,
    unexpectedSelectorUsageCount: [...selectorUsageIds].filter(
      (id) => !expectedSelectorUsageIds.has(id),
    ).length,
    rewritePlanCount: snapshot.output.rewritePlans.length,
    checkerWarningCount: snapshot.output.checkerReport.summary.warnings,
    checkerHintCount: snapshot.output.checkerReport.summary.hints,
    checkerTotalFindings: snapshot.output.checkerReport.summary.total,
  };
}

export function deriveTsTypeFactInputSummary(
  snapshot: EngineParitySnapshotV2,
): TypeFactInputSummaryV0 {
  const byKind: Record<string, number> = {};
  const constrainedKinds: Record<string, number> = {};
  const distinctFactFiles = new Set<string>();
  let finiteValueCount = 0;

  for (const entry of snapshot.input.typeFacts) {
    distinctFactFiles.add(entry.filePath);
    byKind[entry.facts.kind] = (byKind[entry.facts.kind] ?? 0) + 1;

    if (entry.facts.kind === "finiteSet") {
      finiteValueCount += entry.facts.values.length;
    }

    if (entry.facts.kind === "constrained") {
      constrainedKinds[entry.facts.constraintKind] =
        (constrainedKinds[entry.facts.constraintKind] ?? 0) + 1;
    }
  }

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    typeFactCount: snapshot.input.typeFacts.length,
    distinctFactFiles: distinctFactFiles.size,
    byKind,
    constrainedKinds,
    finiteValueCount,
  };
}

export function assertShadowSummaryMatch(
  label: string,
  actual: ShadowSummaryV0,
  expected: ShadowSummaryV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  assertEqualField(label, "sourceCount", actual.sourceCount, expected.sourceCount);
  assertEqualField(label, "styleCount", actual.styleCount, expected.styleCount);
  assertEqualField(label, "typeFactCount", actual.typeFactCount, expected.typeFactCount);
  assertEqualField(
    label,
    "distinctFactFiles",
    actual.distinctFactFiles,
    expected.distinctFactFiles,
  );
  assertEqualField(label, "finiteValueCount", actual.finiteValueCount, expected.finiteValueCount);
  assertEqualField(label, "queryResultCount", actual.queryResultCount, expected.queryResultCount);
  assertEqualField(
    label,
    "selectorUsageReferencedCount",
    actual.selectorUsageReferencedCount,
    expected.selectorUsageReferencedCount,
  );
  assertEqualField(
    label,
    "selectorUsageUnreferencedCount",
    actual.selectorUsageUnreferencedCount,
    expected.selectorUsageUnreferencedCount,
  );
  assertEqualField(
    label,
    "selectorUsageTotalReferences",
    actual.selectorUsageTotalReferences,
    expected.selectorUsageTotalReferences,
  );
  assertEqualField(
    label,
    "selectorUsageDirectReferences",
    actual.selectorUsageDirectReferences,
    expected.selectorUsageDirectReferences,
  );
  assertEqualField(
    label,
    "selectorUsageEditableDirectReferences",
    actual.selectorUsageEditableDirectReferences,
    expected.selectorUsageEditableDirectReferences,
  );
  assertEqualField(
    label,
    "selectorUsageExactReferences",
    actual.selectorUsageExactReferences,
    expected.selectorUsageExactReferences,
  );
  assertEqualField(
    label,
    "selectorUsageInferredOrBetterReferences",
    actual.selectorUsageInferredOrBetterReferences,
    expected.selectorUsageInferredOrBetterReferences,
  );
  assertEqualField(
    label,
    "selectorUsageExpandedCount",
    actual.selectorUsageExpandedCount,
    expected.selectorUsageExpandedCount,
  );
  assertEqualField(
    label,
    "selectorUsageStyleDependencyCount",
    actual.selectorUsageStyleDependencyCount,
    expected.selectorUsageStyleDependencyCount,
  );
  assertEqualField(
    label,
    "expectedExpressionSemanticsCount",
    actual.expectedExpressionSemanticsCount,
    expected.expectedExpressionSemanticsCount,
  );
  assertEqualField(
    label,
    "expectedSourceExpressionResolutionCount",
    actual.expectedSourceExpressionResolutionCount,
    expected.expectedSourceExpressionResolutionCount,
  );
  assertEqualField(
    label,
    "expectedSelectorUsageCount",
    actual.expectedSelectorUsageCount,
    expected.expectedSelectorUsageCount,
  );
  assertEqualField(
    label,
    "expectedTotalQueryCount",
    actual.expectedTotalQueryCount,
    expected.expectedTotalQueryCount,
  );
  assertEqualField(
    label,
    "matchedExpressionQueryPairs",
    actual.matchedExpressionQueryPairs,
    expected.matchedExpressionQueryPairs,
  );
  assertEqualField(
    label,
    "missingExpressionSemanticsCount",
    actual.missingExpressionSemanticsCount,
    expected.missingExpressionSemanticsCount,
  );
  assertEqualField(
    label,
    "missingSourceExpressionResolutionCount",
    actual.missingSourceExpressionResolutionCount,
    expected.missingSourceExpressionResolutionCount,
  );
  assertEqualField(
    label,
    "unexpectedExpressionSemanticsCount",
    actual.unexpectedExpressionSemanticsCount,
    expected.unexpectedExpressionSemanticsCount,
  );
  assertEqualField(
    label,
    "unexpectedSourceExpressionResolutionCount",
    actual.unexpectedSourceExpressionResolutionCount,
    expected.unexpectedSourceExpressionResolutionCount,
  );
  assertEqualField(
    label,
    "matchedSelectorUsageCount",
    actual.matchedSelectorUsageCount,
    expected.matchedSelectorUsageCount,
  );
  assertEqualField(
    label,
    "missingSelectorUsageCount",
    actual.missingSelectorUsageCount,
    expected.missingSelectorUsageCount,
  );
  assertEqualField(
    label,
    "unexpectedSelectorUsageCount",
    actual.unexpectedSelectorUsageCount,
    expected.unexpectedSelectorUsageCount,
  );
  assertEqualField(label, "rewritePlanCount", actual.rewritePlanCount, expected.rewritePlanCount);
  assertEqualField(
    label,
    "checkerWarningCount",
    actual.checkerWarningCount,
    expected.checkerWarningCount,
  );
  assertEqualField(label, "checkerHintCount", actual.checkerHintCount, expected.checkerHintCount);
  assertEqualField(
    label,
    "checkerTotalFindings",
    actual.checkerTotalFindings,
    expected.checkerTotalFindings,
  );
  assertRecordEqual(label, "byKind", actual.byKind, expected.byKind);
  assertRecordEqual(label, "constrainedKinds", actual.constrainedKinds, expected.constrainedKinds);
  assertRecordEqual(label, "queryKindCounts", actual.queryKindCounts, expected.queryKindCounts);
  assertRecordEqual(
    label,
    "expressionValueDomainKinds",
    actual.expressionValueDomainKinds,
    expected.expressionValueDomainKinds,
  );
  assertRecordEqual(
    label,
    "expressionValueConstraintKinds",
    actual.expressionValueConstraintKinds,
    expected.expressionValueConstraintKinds,
  );
  assertConstraintDetailEqual(
    label,
    "expressionConstraintDetailCounts",
    actual.expressionConstraintDetailCounts,
    expected.expressionConstraintDetailCounts,
  );
  assertRecordEqual(
    label,
    "expressionValueCertaintyShapes",
    actual.expressionValueCertaintyShapes,
    expected.expressionValueCertaintyShapes,
  );
  assertRecordEqual(
    label,
    "expressionSelectorCertaintyShapes",
    actual.expressionSelectorCertaintyShapes,
    expected.expressionSelectorCertaintyShapes,
  );
  assertRecordEqual(
    label,
    "resolutionValueConstraintKinds",
    actual.resolutionValueConstraintKinds,
    expected.resolutionValueConstraintKinds,
  );
  assertConstraintDetailEqual(
    label,
    "resolutionConstraintDetailCounts",
    actual.resolutionConstraintDetailCounts,
    expected.resolutionConstraintDetailCounts,
  );
  assertRecordEqual(
    label,
    "resolutionValueCertaintyShapes",
    actual.resolutionValueCertaintyShapes,
    expected.resolutionValueCertaintyShapes,
  );
  assertRecordEqual(
    label,
    "resolutionSelectorCertaintyShapes",
    actual.resolutionSelectorCertaintyShapes,
    expected.resolutionSelectorCertaintyShapes,
  );
}

function assertEqualField<T>(label: string, field: string, actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(
      `${label}: ${field} mismatch\nexpected: ${JSON.stringify(expected)}\nreceived: ${JSON.stringify(actual)}`,
    );
  }
}

function assertRecordEqual(
  label: string,
  field: string,
  actual: Readonly<Record<string, number>>,
  expected: Readonly<Record<string, number>>,
) {
  const actualJson = JSON.stringify(sortRecord(actual));
  const expectedJson = JSON.stringify(sortRecord(expected));
  if (actualJson !== expectedJson) {
    throw new Error(
      `${label}: ${field} mismatch\nexpected: ${expectedJson}\nreceived: ${actualJson}`,
    );
  }
}

function sortRecord(record: Readonly<Record<string, number>>): Record<string, number> {
  return Object.fromEntries(Object.entries(record).toSorted(([a], [b]) => a.localeCompare(b)));
}

function collectQueryPayloadSummary(
  query: QueryResultV2,
  expressionValueDomainKinds: Record<string, number>,
  expressionValueConstraintKinds: Record<string, number>,
  expressionConstraintDetailCounts: ConstraintDetailCounts,
  expressionValueCertaintyShapes: Record<string, number>,
  expressionSelectorCertaintyShapes: Record<string, number>,
  resolutionValueConstraintKinds: Record<string, number>,
  resolutionConstraintDetailCounts: ConstraintDetailCounts,
  resolutionValueCertaintyShapes: Record<string, number>,
  resolutionSelectorCertaintyShapes: Record<string, number>,
  expressionSemanticsIds: Set<string>,
  resolutionIds: Set<string>,
  selectorUsageIds: Set<string>,
  onSelectorUsage: (payload: SelectorUsagePayloadSummary) => void,
) {
  switch (query.kind) {
    case "expression-semantics":
      expressionSemanticsIds.add(query.queryId);
      increment(expressionValueDomainKinds, query.payload.valueDomainKind);
      if (query.payload.valueConstraintKind) {
        increment(expressionValueConstraintKinds, query.payload.valueConstraintKind);
      }
      collectConstraintDetailCounts(
        expressionConstraintDetailCounts,
        query.payload.valuePrefix,
        query.payload.valueSuffix,
        query.payload.valueMinLen,
        query.payload.valueMaxLen,
        query.payload.valueCharMust,
        query.payload.valueCharMay,
        query.payload.valueMayIncludeOtherChars === true,
      );
      if (query.payload.valueCertaintyShapeKind) {
        increment(expressionValueCertaintyShapes, query.payload.valueCertaintyShapeKind);
      }
      if (query.payload.selectorCertaintyShapeKind) {
        increment(expressionSelectorCertaintyShapes, query.payload.selectorCertaintyShapeKind);
      }
      break;
    case "source-expression-resolution":
      resolutionIds.add(query.queryId);
      if (query.payload.valueCertaintyConstraintKind) {
        increment(resolutionValueConstraintKinds, query.payload.valueCertaintyConstraintKind);
      }
      collectConstraintDetailCounts(
        resolutionConstraintDetailCounts,
        query.payload.valuePrefix,
        query.payload.valueSuffix,
        query.payload.valueMinLen,
        query.payload.valueMaxLen,
        query.payload.valueCharMust,
        query.payload.valueCharMay,
        query.payload.valueMayIncludeOtherChars === true,
      );
      if (query.payload.valueCertaintyShapeKind) {
        increment(resolutionValueCertaintyShapes, query.payload.valueCertaintyShapeKind);
      }
      if (query.payload.selectorCertaintyShapeKind) {
        increment(resolutionSelectorCertaintyShapes, query.payload.selectorCertaintyShapeKind);
      }
      break;
    case "selector-usage":
      selectorUsageIds.add(query.queryId);
      onSelectorUsage(query.payload);
      break;
  }
}

function increment(record: Record<string, number>, key: string) {
  record[key] = (record[key] ?? 0) + 1;
}

interface SelectorUsagePayloadSummary {
  readonly totalReferences: number;
  readonly directReferenceCount: number;
  readonly editableDirectReferenceCount: number;
  readonly exactReferenceCount: number;
  readonly inferredOrBetterReferenceCount: number;
  readonly hasExpandedReferences: boolean;
  readonly hasStyleDependencyReferences: boolean;
  readonly hasAnyReferences: boolean;
}

interface ConstraintDetailCounts {
  prefixCount: number;
  suffixCount: number;
  minLenCount: number;
  minLenSum: number;
  maxLenCount: number;
  maxLenSum: number;
  charMustCount: number;
  charMustLenSum: number;
  charMayCount: number;
  charMayLenSum: number;
  mayIncludeOtherCharsCount: number;
}

function createConstraintDetailCounts(): ConstraintDetailCounts {
  return {
    prefixCount: 0,
    suffixCount: 0,
    minLenCount: 0,
    minLenSum: 0,
    maxLenCount: 0,
    maxLenSum: 0,
    charMustCount: 0,
    charMustLenSum: 0,
    charMayCount: 0,
    charMayLenSum: 0,
    mayIncludeOtherCharsCount: 0,
  };
}

function collectConstraintDetailCounts(
  counts: ConstraintDetailCounts,
  prefix: string | undefined,
  suffix: string | undefined,
  minLen: number | undefined,
  maxLen: number | undefined,
  charMust: string | undefined,
  charMay: string | undefined,
  mayIncludeOtherChars: boolean,
) {
  if (prefix !== undefined) counts.prefixCount += 1;
  if (suffix !== undefined) counts.suffixCount += 1;
  if (minLen !== undefined) {
    counts.minLenCount += 1;
    counts.minLenSum += minLen;
  }
  if (maxLen !== undefined) {
    counts.maxLenCount += 1;
    counts.maxLenSum += maxLen;
  }
  if (charMust !== undefined) {
    counts.charMustCount += 1;
    counts.charMustLenSum += charMust.length;
  }
  if (charMay !== undefined) {
    counts.charMayCount += 1;
    counts.charMayLenSum += charMay.length;
  }
  if (mayIncludeOtherChars) {
    counts.mayIncludeOtherCharsCount += 1;
  }
}

function assertConstraintDetailEqual(
  label: string,
  field: string,
  actual: ConstraintDetailCounts,
  expected: ConstraintDetailCounts,
) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      `${label}: ${field} mismatch\nexpected: ${expectedJson}\nreceived: ${actualJson}`,
    );
  }
}
