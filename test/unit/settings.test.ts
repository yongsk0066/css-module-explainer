import { describe, expect, it } from "vitest";
import {
  DEFAULT_RESOURCE_SETTINGS,
  DEFAULT_SETTINGS,
  DEFAULT_WINDOW_SETTINGS,
  mergeSettings,
  parsePathAlias,
  parseResourceSettingsInfo,
  parseResourceSettings,
  parseWindowSettings,
} from "../../server/src/settings";

describe("parseWindowSettings", () => {
  it("returns defaults for undefined", () => {
    expect(parseWindowSettings(undefined)).toEqual(DEFAULT_WINDOW_SETTINGS);
  });

  it("returns defaults for null", () => {
    expect(parseWindowSettings(null)).toEqual(DEFAULT_WINDOW_SETTINGS);
  });

  it("returns defaults for empty object", () => {
    expect(parseWindowSettings({})).toEqual(DEFAULT_WINDOW_SETTINGS);
  });

  it("returns defaults for array input", () => {
    expect(parseWindowSettings([])).toEqual(DEFAULT_WINDOW_SETTINGS);
  });

  it("coerces non-object features to defaults", () => {
    expect(parseWindowSettings({ features: "not an object" })).toEqual(DEFAULT_WINDOW_SETTINGS);
  });

  it("falls back to default when features.hover is non-boolean", () => {
    const result = parseWindowSettings({ features: { hover: "yes" } });
    expect(result.features.hover).toBe(true);
  });

  it("falls back to default warning for invalid severity", () => {
    const result = parseWindowSettings({ diagnostics: { severity: "banana" } });
    expect(result.diagnostics.severity).toBe("warning");
  });

  it("passes through valid severity", () => {
    const result = parseWindowSettings({ diagnostics: { severity: "error" } });
    expect(result.diagnostics.severity).toBe("error");
  });

  it("falls back to default for NaN maxCandidates", () => {
    const result = parseWindowSettings({ hover: { maxCandidates: NaN } });
    expect(result.hover.maxCandidates).toBe(DEFAULT_WINDOW_SETTINGS.hover.maxCandidates);
  });

  it("falls back to default for Infinity maxCandidates", () => {
    const result = parseWindowSettings({ hover: { maxCandidates: Infinity } });
    expect(result.hover.maxCandidates).toBe(DEFAULT_WINDOW_SETTINGS.hover.maxCandidates);
  });

  it("passes through valid numeric maxCandidates", () => {
    const result = parseWindowSettings({ hover: { maxCandidates: 25 } });
    expect(result.hover.maxCandidates).toBe(25);
  });

  it("ignores extra fields and accepts valid nested overrides", () => {
    const result = parseWindowSettings({ extraField: "ignored", features: { hover: false } });
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

  it("DEFAULT_RESOURCE_SETTINGS.pathAlias is empty", () => {
    expect(DEFAULT_RESOURCE_SETTINGS.pathAlias).toEqual({});
  });
});

describe("parseResourceSettings", () => {
  it("uses defaults when no resource config is present", () => {
    expect(parseResourceSettings({})).toEqual(DEFAULT_RESOURCE_SETTINGS);
  });

  it("DEFAULT_RESOURCE_SETTINGS.scss.classnameTransform is 'asIs'", () => {
    expect(DEFAULT_RESOURCE_SETTINGS.scss.classnameTransform).toBe("asIs");
  });

  it("accepts every valid mode", () => {
    for (const mode of ["asIs", "camelCase", "camelCaseOnly", "dashes", "dashesOnly"] as const) {
      const result = parseResourceSettings({ scss: { classnameTransform: mode } });
      expect(result.scss.classnameTransform).toBe(mode);
    }
  });

  it("falls back to 'asIs' for invalid mode strings", () => {
    const result = parseResourceSettings({ scss: { classnameTransform: "snakeCase" } });
    expect(result.scss.classnameTransform).toBe("asIs");
  });

  it("prefers native pathAlias over compat pathAlias", () => {
    const result = parseResourceSettings(
      { pathAlias: { "@native": "src/native" } },
      { pathAlias: { "@compat": "src/compat" } },
    );
    expect(result.pathAlias).toEqual({ "@native": "src/native" });
  });

  it("falls back to compat pathAlias when native key is absent", () => {
    const result = parseResourceSettings({}, { pathAlias: { "@compat": "src/compat" } });
    expect(result.pathAlias).toEqual({ "@compat": "src/compat" });
  });

  it("reports compat pathAlias source when the fallback key is used", () => {
    const result = parseResourceSettingsInfo({}, { pathAlias: { "@compat": "src/compat" } });
    expect(result.settings.pathAlias).toEqual({ "@compat": "src/compat" });
    expect(result.pathAliasSource).toBe("compat");
  });

  it("reports native pathAlias source when the native key is used", () => {
    const result = parseResourceSettingsInfo(
      { pathAlias: { "@native": "src/native" } },
      { pathAlias: { "@compat": "src/compat" } },
    );
    expect(result.settings.pathAlias).toEqual({ "@native": "src/native" });
    expect(result.pathAliasSource).toBe("native");
  });
});

describe("mergeSettings", () => {
  it("combines window and resource settings into the runtime Settings shape", () => {
    expect(mergeSettings(DEFAULT_WINDOW_SETTINGS, DEFAULT_RESOURCE_SETTINGS)).toEqual(
      DEFAULT_SETTINGS,
    );
  });
});
