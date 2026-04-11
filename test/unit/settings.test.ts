import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parsePathAlias, parseSettings } from "../../server/src/settings";

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

describe("parsePathAlias", () => {
  it("accepts a well-formed Record<string, string>", () => {
    expect(parsePathAlias({ "@s": "src/styles" })).toEqual({ "@s": "src/styles" });
  });

  it("falls back to {} for non-record inputs", () => {
    expect(parsePathAlias(null)).toEqual({});
    expect(parsePathAlias(undefined)).toEqual({});
    expect(parsePathAlias("string")).toEqual({});
    expect(parsePathAlias(42)).toEqual({});
  });

  it("drops non-string values from the record", () => {
    expect(parsePathAlias({ "@s": 42, "@t": true, "@u": "src" })).toEqual({ "@u": "src" });
  });

  it("DEFAULT_SETTINGS.pathAlias is empty", () => {
    expect(DEFAULT_SETTINGS.pathAlias).toEqual({});
  });

  it("parseSettings emits an empty pathAlias — compat read happens in fetchSettings", () => {
    const result = parseSettings({});
    expect(result.pathAlias).toEqual({});
  });
});

describe("classnameTransform settings", () => {
  it("DEFAULT_SETTINGS.scss.classnameTransform is 'asIs'", () => {
    expect(DEFAULT_SETTINGS.scss.classnameTransform).toBe("asIs");
  });

  it("accepts every valid mode", () => {
    for (const mode of ["asIs", "camelCase", "camelCaseOnly", "dashes", "dashesOnly"] as const) {
      const result = parseSettings({ scss: { classnameTransform: mode } });
      expect(result.scss.classnameTransform).toBe(mode);
    }
  });

  it("falls back to 'asIs' for invalid mode strings", () => {
    const result = parseSettings({ scss: { classnameTransform: "snakeCase" } });
    expect(result.scss.classnameTransform).toBe("asIs");
  });

  it("falls back to 'asIs' when scss section missing entirely", () => {
    const result = parseSettings({});
    expect(result.scss.classnameTransform).toBe("asIs");
  });
});
