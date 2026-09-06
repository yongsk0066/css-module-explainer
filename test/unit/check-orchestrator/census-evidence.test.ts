import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CENSUS_ROW_IDS,
  assertCensusPopulation,
  assertNoLiteralRowSelection,
  checkerInventory,
} from "../../../scripts/lib/census-instrument-evidence";
import { compilerApi as ts } from "../../../server/engine-core-ts/src/ts-facade";
import type tsTypes from "../../../server/engine-core-ts/src/ts-facade";
import { hasRuntimeEvidence } from "../../../scripts/lib/rust-semver-intent";

const root = path.resolve(__dirname, "../../..");
const tick = String.fromCharCode(96);

describe("census evidence operands", () => {
  it("requires every externally declared row, naming each removal", () => {
    expect(() => assertCensusPopulation(CENSUS_ROW_IDS)).not.toThrow();
    for (const missing of CENSUS_ROW_IDS) {
      expect(() => assertCensusPopulation(CENSUS_ROW_IDS.filter((id) => id !== missing))).toThrow(
        "census row missing " + missing,
      );
    }
    expect(() => assertCensusPopulation([...CENSUS_ROW_IDS, "invented"])).toThrow(
      "unexpected census row invented",
    );
  });

  it.each([
    'row.id == "a1"',
    'row.id === "a1"',
    '"a1" === row.id',
    '(row.id) === ("a1")',
    '["a1"].includes(row.id)',
    'row.id.includes("a1")',
    "row.id === " + tick + "a1" + tick,
    tick + "a1" + tick + " === (row.id)",
    'row["id"] === "a1"',
    'row.expected.refusal === "binding does not exercise"',
    '"binding does not exercise" === (row.expected.refusal)',
    '["binding does not exercise"].includes(row.expected.refusal)',
    "row.expected.refusalPrefix === " + tick + "production reaches test constructor " + tick,
  ])("refuses literal selection through %s", (expression) => {
    expect(() =>
      assertNoLiteralRowSelection(
        "declare const inventory: any; function select(row) { return " +
          expression +
          "; } inventory.s0Rows.forEach(select);",
      ),
    ).toThrow("per-row literal selection is forbidden");
  });

  it("refuses switches and local aliases, while permitting typed mechanism dispatch", () => {
    for (const source of [
      'switch ((row.id)) { case "a1": break; }',
      'const prefix = row.expected.refusalPrefix; if (prefix === "unregistered") {}',
      'const id = (row.id); const alias = id; if ("f" == alias) {}',
      'const id = "a1"; if (row.id === id) {}',
      'const ids = ["a1"]; if (ids.includes(row.id)) {}',
      'const text = "binding does not exercise"; if (row.expected.refusal === text) {}',
      'const id = "a1"; const alias = id; if (alias === row.id) {}',
      'const id = "a1"; function nested(entry) { return entry.id === id; } nested(row);',
      'function nested(entry) { const id = "a1"; { return entry.id === id; } } nested(row);',
    ])
      expect(() =>
        assertNoLiteralRowSelection(
          "declare const inventory: any; for (const row of inventory.s0Rows) { " + source + " }",
        ),
      ).toThrow("per-row literal selection");
    expect(() =>
      assertNoLiteralRowSelection(
        'switch (row.gate.kind) { case "compiler": break; } const x = row.expected.refusal;',
      ),
    ).not.toThrow();
    expect(() =>
      assertNoLiteralRowSelection(
        'const id = "a1"; function nested(row, id) { return row.id === id; }',
      ),
    ).not.toThrow();
    expect(() =>
      assertNoLiteralRowSelection(
        'function nested(row, id) { return row.id === id; } const id = "a1";',
      ),
    ).not.toThrow();
    expect(() =>
      assertNoLiteralRowSelection(
        'const id = "a1"; function nested(row, input) { { const id = input; return row.id === id; } }',
      ),
    ).not.toThrow();
    expect(() =>
      assertNoLiteralRowSelection(
        readFileSync(path.join(root, "scripts/check-rust-census-instrument-s0.ts"), "utf8"),
      ),
    ).not.toThrow();
  });

  it.each([
    'for (const spectralEntry of inventory.s0Rows) { if (spectralEntry.id === "a1") {} }',
    'for (const { id: token } of inventory.s0Rows) { if ("a1" !== token) {} }',
    'let needle = "a1"; for (const record of inventory.s0Rows) { if (record.id === needle) {} }',
    'let needle; needle = "off-menu"; for (const record of inventory.s0Rows) { if (record.id === needle) {} }',
    'const choices = new Set(["off-menu"]); for (const record of inventory.s0Rows) { if (choices.has(record.id)) {} }',
    'const choices = new Map([["off-menu", handler]]); for (const record of inventory.s0Rows) { if (choices.has(record.id)) {} }',
    'const choices = { "off-menu": handler }; for (const record of inventory.s0Rows) { if (record.id in choices) {} }',
    "const choices = { novel: handler }; const alias = choices; for (const record of inventory.s0Rows) { if (record.id in alias) {} }",
    'function choices() { return new Set(["off-menu"]); } for (const record of inventory.s0Rows) { if (choices().has(record.id)) {} }',
    'const choices = [dynamic, "off-menu"]; for (const record of inventory.s0Rows) { if (choices.includes(record.id)) {} }',
    'const options = { needle: "off-menu" }; for (const record of inventory.s0Rows) { if (record.id === options.needle) {} }',
    'const options = ["off-menu"]; const [needle] = options; for (const record of inventory.s0Rows) { if (record.id === needle) {} }',
    'const needle = () => "a1"; for (const record of inventory.s0Rows) { if (record.id === needle()) {} }',
    'function select(entry, needle) { return entry.id === needle; } for (const record of inventory.s0Rows) select(record, "a1");',
    "for (const record of inventory.s0Rows) { const normalized = record.id.toLowerCase(); if (/a/.test(normalized)) {} }",
    "for (const record of inventory.s0Rows) { const copy = `" +
      "${record.id}" +
      '`; if (copy === "a1") {} }',
    'for (const record of inventory.s0Rows) { const box = { nested: { item: record } }; const { nested: { item: alias } } = box; if (alias.id === "a1") {} }',
    'const boxes = inventory.s0Rows.map(entry => ({ payload: entry })); for (const { payload } of boxes) { if (payload.id.startsWith("a")) {} }',
    'for (const record of inventory.s0Rows) { const alias = opaqueIdentity(record); if (alias.id === "a1") {} }',
    'inventory.s0Rows.filter(({ id }) => id.startsWith("a"));',
    'inventory.s0Rows.some(record => record.id.endsWith("1"));',
    'inventory.s0Rows.forEach(record => record.id.indexOf("a"));',
    'inventory.s0Rows.find(record => record.id.lastIndexOf("a"));',
    "inventory.s0Rows.map(record => record.id.match(/a/));",
    "inventory.s0Rows.filter(record => record.id.search(/a/));",
    "inventory.s0Rows.filter(record => /a/.test(record.id));",
    "for (const record of inventory.s0Rows) { dispatch[record.id](); }",
    'const records = inventory.s0Rows; const renamed = records.filter(Boolean); for (const record of renamed) { if (["a1"].includes(record.id)) {} }',
    'const { s0Rows: records } = inventory; for (const record of records) { if ("a1" in record.id) {} }',
    'function select(entry) { return entry.id === "a1"; } inventory.s0Rows.filter(select);',
    'function select(entry) { return entry.id === "a1"; } for (const record of inventory.s0Rows) select(record);',
    'for (const record of inventory.s0Rows) { const { expected: { refusal: message } } = record; if (message === "failure") {} }',
  ])("authority-flow selection refuses %s", (body) => {
    expect(() => assertNoLiteralRowSelection("declare const inventory: any; " + body)).toThrow(
      "per-row literal selection is forbidden",
    );
  });

  it("authority-flow selection preserves unrelated bindings and mechanism dispatch", () => {
    for (const body of [
      'for (const record of inventory.s0Rows) { switch (record.gate.kind) { case "compiler": break; } }',
      "for (const record of inventory.s0Rows) { if (requested.has(record.id)) {} }",
      "const options = { value: external }; for (const record of inventory.s0Rows) { if (record.id === options.value) {} }",
      "const choices = new Set(external); for (const record of inventory.s0Rows) { if (choices.has(record.id)) {} }",
      'for (const record of inventory.s0Rows) { { const record = { id: "other" }; if (record.id === "other") {} } }',
      'function select(row) { return row.id === "unrelated"; }',
      'for (const record of inventory.s0Rows) { const { id } = external; if (id === "unrelated") {} }',
    ])
      expect(() =>
        assertNoLiteralRowSelection("declare const inventory: any; " + body),
      ).not.toThrow();
  });

  it.each(["map", "filter", "find", "some", "every", "forEach"])(
    "binds renamed and destructured selectors in %s callbacks",
    (method) => {
      for (const callback of [
        '(nebulaEntry) => { const alias = nebulaEntry; return alias.id === "off-menu"; }',
        "({ id: needle }) => /off-menu/.test(needle)",
        '({ refusal }) => refusal.includes("off-menu")',
        '(nebulaEntry) => nebulaEntry.refusalPrefix.startsWith("off-menu")',
      ])
        expect(() =>
          assertNoLiteralRowSelection("inventory.s0Rows." + method + "(" + callback + ");"),
        ).toThrow("per-row literal selection is forbidden");
    },
  );

  it("tracks loop aliases and refusal destructuring by their lexical declarations", () => {
    for (const body of [
      'for (const nebulaEntry of inventory.s0Rows) { const alias = nebulaEntry; const { refusal } = alias; if (refusal === "off-menu") {} }',
      'for (const { refusal: message } of inventory.s0Rows) { if (message.endsWith("off-menu")) {} }',
      "for (const { refusalPrefix } of inventory.s0Rows) { dispatch[refusalPrefix](); }",
      'for (const entry of inventory.s0Rows) { { var\n needle = entry.id; } if (needle === "off-menu") {} }',
      'const choose = function inspect(entry) { return entry.id === "off-menu"; }; inventory.s0Rows.some(choose);',
    ])
      expect(() => assertNoLiteralRowSelection(body)).toThrow(
        "per-row literal selection is forbidden",
      );
  });

  it("keeps loop, callback, catch and block shadowing independent of authority bindings", () => {
    for (const body of [
      'const entry = external; for (const entry of inventory.s0Rows) { use(entry.id); } if (entry.id === "unrelated") {}',
      'inventory.s0Rows.forEach(entry => use(entry.id)); others.forEach(entry => entry.id === "unrelated");',
      'for (const entry of inventory.s0Rows) { try {} catch (entry) { if (entry.id === "unrelated") {} } }',
      'for (const entry of inventory.s0Rows) { { const alias = external; if (alias.id === "unrelated") {} } const alias = entry; use(alias.id); }',
      'const entry = external; for (const entry of inventory.s0Rows) { function nested(entry) { return entry.id === "unrelated"; } nested(external); }',
      'const id = "unrelated"; for (const entry of inventory.s0Rows) { if (entry.id === external.id) {} }',
    ])
      expect(() => assertNoLiteralRowSelection(body)).not.toThrow();
  });

  it("keys actual calls and the helper definition by their complete source content", () => {
    const source =
      'function blockBody(x) { return x; }\nassert.match(value, /required/);\nblockBody("x");\n';
    const initial = checkerInventory("checker.ts", source);
    const changed = checkerInventory("checker.ts", source.replace("/required/", "/(?:)/"));
    expect(initial).toHaveLength(3);
    expect(initial.filter((row) => row.kind === "blockBody")).toHaveLength(2);
    expect(changed.find((row) => row.kind === "assert")!.identity).not.toEqual(
      initial.find((row) => row.kind === "assert")!.identity,
    );
    expect(
      checkerInventory("checker.ts", source + '// assert.ok(true); blockBody("decoy");\n'),
    ).toEqual(initial);
  });
});

describe("acquisition population bookkeeping", () => {
  it("prints population operands without asserting their shared-input identity", () => {
    const source = readFileSync(
      path.join(root, "scripts/check-rust-fs-acquisition-census.ts"),
      "utf8",
    );
    const file = ts.createSourceFile("acquisition.ts", source, ts.ScriptTarget.Latest, true);
    const counts = new Set([
      "observedExpressionCount",
      "birthExpressionCount",
      "removedExpressionCount",
      "admittedExpressionCount",
    ]);
    const assertions: string[] = [];
    const visit = (node: tsTypes.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === "assert"
      ) {
        const operands = (child: tsTypes.Node): void => {
          if (ts.isIdentifier(child) && counts.has(child.text)) assertions.push(child.text);
          ts.forEachChild(child, operands);
        };
        node.arguments.forEach(operands);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    expect(assertions).toEqual([]);
    expect(source).toContain('kind: "bookkeeping-only"');
  });
});

describe("semver declaration evidence", () => {
  const needle = "provider_completeness: ProviderCompletenessV1";
  const declared = "pub struct AnalysisPrecisionV1 {\n    " + needle + ",\n}";
  const decoys = [
    "fn from_axes(" + needle + ") {}",
    "/// " + needle,
    'const DECOY: &str = "' + needle + '";',
    "struct DifferentType {\n    " + needle + ",\n}",
  ].join("\n");
  it("requires the field in the certified struct even when every decoy survives", () => {
    expect(hasRuntimeEvidence(declared + "\n" + decoys, needle, "AnalysisPrecisionV1")).toBe(true);
    expect(
      hasRuntimeEvidence(
        declared.replace(needle + ",", "") + "\n" + decoys,
        needle,
        "AnalysisPrecisionV1",
      ),
    ).toBe(false);
    expect(() => hasRuntimeEvidence(declared, needle)).toThrow("struct declaration operand");
  });
  it("does not accept a comment or string transcription as runtime evidence", () => {
    const value = "WorldAssumptionV1::Open";
    expect(hasRuntimeEvidence("// " + value + '\nconst X: &str = "' + value + '";', value)).toBe(
      false,
    );
    expect(hasRuntimeEvidence("let world = " + value + ";", value)).toBe(true);
    expect(
      hasRuntimeEvidence(
        '#[serde(rename = "k-cfa")]\nKLimitedCallSite,',
        '#[serde(rename = "k-cfa")]',
      ),
    ).toBe(true);
  });
});
