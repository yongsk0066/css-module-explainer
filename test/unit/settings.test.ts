import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettings } from "../../server/src/settings";

describe("parseSettings", () => {
  it("returns defaults for undefined", () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("returns defaults for null", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("returns defaults for empty object", () => {
    expect(parseSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it("returns defaults for array input", () => {
    expect(parseSettings([])).toEqual(DEFAULT_SETTINGS);
  });

  it("coerces non-object features to defaults", () => {
    expect(parseSettings({ features: "not an object" })).toEqual(DEFAULT_SETTINGS);
  });

  it("falls back to default when features.hover is non-boolean", () => {
    const result = parseSettings({ features: { hover: "yes" } });
    expect(result.features.hover).toBe(true);
  });

  it("falls back to default warning for invalid severity", () => {
    const result = parseSettings({ diagnostics: { severity: "banana" } });
    expect(result.diagnostics.severity).toBe("warning");
  });

  it("passes through valid severity", () => {
    const result = parseSettings({ diagnostics: { severity: "error" } });
    expect(result.diagnostics.severity).toBe("error");
  });

  it("falls back to default for NaN maxCandidates", () => {
    const result = parseSettings({ hover: { maxCandidates: NaN } });
    expect(result.hover.maxCandidates).toBe(DEFAULT_SETTINGS.hover.maxCandidates);
  });

  it("falls back to default for Infinity maxCandidates", () => {
    const result = parseSettings({ hover: { maxCandidates: Infinity } });
    expect(result.hover.maxCandidates).toBe(DEFAULT_SETTINGS.hover.maxCandidates);
  });

  it("passes through valid numeric maxCandidates", () => {
    const result = parseSettings({ hover: { maxCandidates: 25 } });
    expect(result.hover.maxCandidates).toBe(25);
  });

  it("ignores extra fields and accepts valid nested overrides", () => {
    const result = parseSettings({ extraField: "ignored", features: { hover: false } });
    expect(result.features.hover).toBe(false);
    expect(result.features.definition).toBe(true);
  });
});
