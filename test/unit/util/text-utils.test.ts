import { describe, it, expect } from "vitest";
import {
  getLineAt,
  levenshteinDistance,
  findClosestMatch,
  pathToFileUrl,
  fileUrlToPath,
} from "../../../server/engine-core-ts/src/core/util/text-utils";

describe("getLineAt", () => {
  it("returns the requested 0-indexed line", () => {
    const content = "alpha\nbeta\ngamma";
    expect(getLineAt(content, 0)).toBe("alpha");
    expect(getLineAt(content, 1)).toBe("beta");
    expect(getLineAt(content, 2)).toBe("gamma");
  });

  it("handles CRLF endings without including \\r", () => {
    const content = "alpha\r\nbeta\r\n";
    expect(getLineAt(content, 0)).toBe("alpha");
    expect(getLineAt(content, 1)).toBe("beta");
  });

  it("returns undefined for out-of-range lines", () => {
    expect(getLineAt("one\ntwo", 5)).toBeUndefined();
    expect(getLineAt("one\ntwo", -1)).toBeUndefined();
  });

  it("handles the last line with no trailing newline", () => {
    expect(getLineAt("one\ntwo", 1)).toBe("two");
  });

  it("handles an empty string", () => {
    expect(getLineAt("", 0)).toBe("");
  });

  it("handles a single line with no newline", () => {
    expect(getLineAt("single", 0)).toBe("single");
  });
});

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("abc", "abc")).toBe(0);
  });

  it("returns the length of the other string when one is empty", () => {
    expect(levenshteinDistance("", "abc")).toBe(3);
    expect(levenshteinDistance("abc", "")).toBe(3);
  });

  it("handles single edits", () => {
    expect(levenshteinDistance("abc", "abd")).toBe(1); // substitution
    expect(levenshteinDistance("abc", "ab")).toBe(1); // deletion
    expect(levenshteinDistance("abc", "abcd")).toBe(1); // insertion
  });

  it("handles typical typos", () => {
    expect(levenshteinDistance("indicator", "indicatorr")).toBe(1);
    expect(levenshteinDistance("button", "buton")).toBe(1);
    expect(levenshteinDistance("primary", "primery")).toBe(1);
  });
});

describe("findClosestMatch", () => {
  it("returns the closest candidate within the default distance", () => {
    const result = findClosestMatch("indicatorr", ["indicator", "button", "primary"]);
    expect(result).toBe("indicator");
  });

  it("returns null when no candidate is within maxDistance", () => {
    const result = findClosestMatch("zzzzz", ["alpha", "beta", "gamma"]);
    expect(result).toBeNull();
  });

  it("honors a custom maxDistance", () => {
    expect(findClosestMatch("abc", ["xyz"], 5)).toBe("xyz");
    expect(findClosestMatch("abc", ["xyz"], 1)).toBeNull();
  });

  it("returns null for an empty candidate list", () => {
    expect(findClosestMatch("abc", [])).toBeNull();
  });

  it("breaks ties deterministically (first match wins)", () => {
    // Both 'ab' and 'bc' are distance 1 from 'ac'; iteration
    // order picks whichever comes first.
    const candidates = ["ab", "bc"];
    const result = findClosestMatch("ac", candidates);
    expect(result).toBe("ab");
  });
});

describe("pathToFileUrl / fileUrlToPath round trip", () => {
  it("converts an absolute path to a file: URL", () => {
    expect(pathToFileUrl("/abs/path/a.tsx")).toBe("file:///abs/path/a.tsx");
  });

  it("decodes a file: URL back to an absolute path", () => {
    expect(fileUrlToPath("file:///abs/path/a.tsx")).toBe("/abs/path/a.tsx");
  });

  it("round-trips a path with spaces safely", () => {
    const original = "/abs/With Space/a.tsx";
    expect(fileUrlToPath(pathToFileUrl(original))).toBe(original);
  });
});
