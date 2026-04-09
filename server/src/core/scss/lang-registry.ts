import type { StyleLang } from "@css-module-explainer/shared";
import postcssScss from "postcss-scss";

/**
 * Immutable list of every style language this extension understands.
 *
 * Adding a new language (e.g. LESS in 1.1+) is one new entry plus
 * importing its postcss syntax. No other file in the project
 * hard-codes an extension or a syntax — they all read from this
 * list via the helpers below.
 */
export const STYLE_LANGS: readonly StyleLang[] = [
  {
    id: "scss",
    extensions: [".module.scss"],
    syntax: postcssScss,
    displayName: "SCSS",
  },
  {
    id: "css",
    extensions: [".module.css"],
    syntax: null, // vanilla postcss handles plain CSS
    displayName: "CSS",
  },
] as const;

/** Flat list of every `.module.<ext>` this project indexes. */
export function getAllStyleExtensions(): readonly string[] {
  return STYLE_LANGS.flatMap((lang) => lang.extensions);
}

/** Pick the lang entry for a file path, or null if unrelated. */
export function findLangForPath(filePath: string): StyleLang | null {
  for (const lang of STYLE_LANGS) {
    for (const ext of lang.extensions) {
      if (filePath.endsWith(ext)) {
        return lang;
      }
    }
  }
  return null;
}

/**
 * Build the regex used by cx-binding-detector to spot style imports:
 *   import styles from './Button.module.scss';
 *
 * Capture groups:
 *   [1] → the default-import identifier ('styles')
 *   [2] → the module specifier ('./Button.module.scss')
 *
 * Returns a fresh regex per call so callers are not exposed to
 * stateful `lastIndex` sharing from `/g` flag leaks.
 */
export function buildStyleImportRegex(): RegExp {
  const exts = getAllStyleExtensions()
    .map((ext) => ext.replace(/\./g, "\\."))
    .join("|");
  return new RegExp(String.raw`import\s+(\w+)\s+from\s+['"]([^'"]+(?:${exts}))['"]`);
}

/**
 * Build the `workspace/didChangeWatchedFiles` glob pattern.
 * Example output: `**\/\*.module.{scss,css}`
 */
export function buildStyleFileWatcherGlob(): string {
  const stems = STYLE_LANGS.flatMap((lang) =>
    lang.extensions.map((ext) => ext.replace(/^\.module\./, "")),
  );
  return `**/*.module.{${stems.join(",")}}`;
}
