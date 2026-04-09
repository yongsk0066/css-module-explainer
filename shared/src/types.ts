/** 0-based line and character position in a text document. */
export interface Position {
  readonly line: number;
  readonly character: number;
}

/** 0-based range with inclusive `start` and exclusive `end`. */
export interface Range {
  readonly start: Position;
  readonly end: Position;
}

/**
 * Style language descriptor — one entry per `.module.<ext>` target.
 *
 * `syntax` is typed as `unknown` so this module can remain runtime-free
 * (Layer 3 rule: shared must not import postcss or any runtime dep).
 * The server narrows it back to `postcss.Syntax | null` at the boundary.
 */
export interface StyleLang {
  readonly id: "scss" | "css";
  readonly extensions: readonly string[];
  readonly syntax: unknown;
  readonly displayName: string;
}

/** A single class selector recovered from a CSS Module. */
export interface SelectorInfo {
  /** Resolved class name (e.g. `button--primary` after `&` nesting). */
  readonly name: string;
  /** Position of the class token within the source file. */
  readonly range: Range;
  /** Original selector string (e.g. `.button:hover .indicator`). */
  readonly fullSelector: string;
  /** Flattened declarations text (e.g. `color: red; font-size: 14px`). */
  readonly declarations: string;
  /** Full `{ ... }` rule block, used by peek views. */
  readonly ruleRange: Range;
}

/** Immutable map from class name to its info, produced per style file. */
export type ScssClassMap = ReadonlyMap<string, SelectorInfo>;
