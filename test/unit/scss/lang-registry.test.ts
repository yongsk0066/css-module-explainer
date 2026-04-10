import { describe, it, expect } from "vitest";
import {
  STYLE_LANGS,
  findLangForPath,
  getAllStyleExtensions,
  buildStyleImportRegex,
  buildStyleFileWatcherGlob,
} from "../../../server/src/core/scss/lang-registry";

describe("STYLE_LANGS registry", () => {
  it("contains scss, css, and less", () => {
    expect(STYLE_LANGS.map((l) => l.id)).toEqual(["scss", "css", "less"]);
  });

  it("each entry has at least one extension starting with .module.", () => {
    for (const lang of STYLE_LANGS) {
      expect(lang.extensions.length).toBeGreaterThan(0);
      for (const ext of lang.extensions) {
        expect(ext.startsWith(".module.")).toBe(true);
      }
    }
  });
});

describe("getAllStyleExtensions", () => {
  it("returns every extension across every lang", () => {
    const exts = getAllStyleExtensions();
    expect(exts).toContain(".module.scss");
    expect(exts).toContain(".module.css");
  });

  it("has no duplicates", () => {
    const exts = getAllStyleExtensions();
    expect(new Set(exts).size).toBe(exts.length);
  });
});

describe("findLangForPath", () => {
  it("matches .module.scss to scss", () => {
    expect(findLangForPath("/abs/path/Button.module.scss")?.id).toBe("scss");
  });

  it("matches .module.css to css", () => {
    expect(findLangForPath("/abs/path/Form.module.css")?.id).toBe("css");
  });

  it("returns null for plain .scss (not a CSS module)", () => {
    expect(findLangForPath("/abs/path/_variables.scss")).toBeNull();
  });

  it("returns null for plain .css", () => {
    expect(findLangForPath("/abs/path/reset.css")).toBeNull();
  });

  it("returns null for unrelated files", () => {
    expect(findLangForPath("/abs/path/Button.tsx")).toBeNull();
  });
});

describe("buildStyleImportRegex", () => {
  it("matches an scss module import", () => {
    const re = buildStyleImportRegex();
    const match = re.exec(`import styles from './Button.module.scss';`);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("styles");
    expect(match?.[2]).toBe("./Button.module.scss");
  });

  it("matches a css module import", () => {
    const re = buildStyleImportRegex();
    const match = re.exec(`import css from "../styles/Form.module.css";`);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("css");
    expect(match?.[2]).toBe("../styles/Form.module.css");
  });

  it("does not match a non-module style import", () => {
    const re = buildStyleImportRegex();
    expect(re.exec(`import './reset.css';`)).toBeNull();
  });

  it("is a fresh regex on every call (no lastIndex leaking)", () => {
    const a = buildStyleImportRegex();
    const b = buildStyleImportRegex();
    expect(a).not.toBe(b);
  });
});

describe("buildStyleFileWatcherGlob", () => {
  it("produces a glob that mentions both scss and css", () => {
    const glob = buildStyleFileWatcherGlob();
    expect(glob).toMatch(/scss/);
    expect(glob).toMatch(/css/);
  });
});
