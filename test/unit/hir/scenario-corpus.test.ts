import { describe, expect, it } from "vitest";
import {
  SOURCE_SCENARIOS,
  STYLE_SCENARIOS,
  loadSourceScenario,
  loadStyleScenario,
  normalizeSourceDocument,
  normalizeStyleDocument,
} from "../../_fixtures/scenario-corpus";

describe("HIR scenario corpus / source", () => {
  for (const scenario of SOURCE_SCENARIOS) {
    it(`${scenario.id} builds stable source HIR snapshots`, () => {
      const loaded = loadSourceScenario(scenario);
      expect(normalizeSourceDocument(loaded.sourceDocument)).toMatchSnapshot();
    });
  }
});

describe("HIR scenario corpus / style", () => {
  for (const scenario of STYLE_SCENARIOS) {
    it(`${scenario.id} builds stable style HIR snapshots`, () => {
      const loaded = loadStyleScenario(scenario);
      expect(normalizeStyleDocument(loaded.styleDocument)).toMatchSnapshot();
    });
  }
});
