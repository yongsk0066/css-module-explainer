import { describe, expect, it } from "vitest";
import {
  SOURCE_SCENARIOS,
  STYLE_SCENARIOS,
  loadSourceScenario,
  loadStyleScenario,
  normalizeClassMap,
  normalizeClassRefs,
  normalizeSourceDocument,
  normalizeStyleDocument,
} from "../../_fixtures/scenario-corpus";

describe("HIR scenario corpus / source differential", () => {
  for (const scenario of SOURCE_SCENARIOS) {
    it(`${scenario.id} keeps legacy class refs equivalent through source HIR`, () => {
      const loaded = loadSourceScenario(scenario);

      expect(normalizeClassRefs(loaded.compatClassRefs)).toEqual(
        normalizeClassRefs(loaded.legacyClassRefs),
      );
      expect(normalizeSourceDocument(loaded.sourceDocument)).toMatchSnapshot();
    });
  }
});

describe("HIR scenario corpus / style differential", () => {
  for (const scenario of STYLE_SCENARIOS) {
    it(`${scenario.id} keeps legacy selector maps equivalent through style HIR`, () => {
      const loaded = loadStyleScenario(scenario);

      expect(normalizeClassMap(loaded.compatClassMap)).toEqual(
        normalizeClassMap(loaded.legacyClassMap),
      );
      expect(normalizeStyleDocument(loaded.styleDocument)).toMatchSnapshot();
    });
  }
});
