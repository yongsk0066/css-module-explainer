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
  readonly id: "scss" | "css" | "less";
  readonly extensions: readonly string[];
  readonly syntax: unknown;
  readonly displayName: string;
}

/**
 * A `composes` reference found inside a CSS Module rule.
 * e.g. `composes: base lg from './base.module.css'`
 */
export interface ComposesRef {
  readonly classNames: readonly string[];
  /** Relative path to the source module. Undefined = same file. */
  readonly from?: string;
  /** `composes: x from global` — global (non-module) scope. */
  readonly fromGlobal?: boolean;
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
  /** CSS Modules `composes` references, if any. */
  readonly composes?: readonly ComposesRef[];
}

/** Immutable map from class name to its info, produced per style file. */
export type ScssClassMap = ReadonlyMap<string, SelectorInfo>;

// ──────────────────────────────────────────────────────────────
// Cx binding + call types (Phases 2 + 3)
// ──────────────────────────────────────────────────────────────

/**
 * A single `const cx = classNames.bind(styles)` binding detected
 * in one source file. A file may have several bindings (different
 * `styles` imports, different scopes).
 */
export interface CxBinding {
  /** Identifier used at call sites — `cx`, `classes`, `cxBtn`, etc. */
  readonly cxVarName: string;
  /** Identifier for the styles default-import. */
  readonly stylesVarName: string;
  /** Absolute path of the `.module.scss|css` file the binding resolves to. */
  readonly scssModulePath: string;
  /**
   * Scope in which this binding is visible. Top-level bindings have
   * `{ startLine: 0, endLine: sourceFileLastLine }`. Function-scoped
   * bindings carry the enclosing function's line range.
   */
  readonly scope: {
    readonly startLine: number;
    readonly endLine: number;
  };
  /**
   * Identifier the `classnames/bind` default import was bound to
   * in this file. Usually `"classNames"`, but aliased imports allow any
   * name (e.g. `"cn"`).
   */
  readonly classNamesImportName: string;
}

/**
 * Base shape for a single `cx()` argument that resolves (or fails
 * to resolve) to one or more class names.
 *
 * @internal This base is not exported from the shared package. Its
 * fields are inlined into each concrete `CxCallInfo` variant via
 * declaration merging so consumers see a flat discriminated union,
 * not a nested hierarchy.
 */
interface CxCallBase {
  /**
   * LSP highlight range for the specific class token, quote
   * characters excluded. For `cx('indicator')`, this covers only
   * the `indicator` text, not the surrounding apostrophes.
   */
  readonly originRange: Range;
  /** The binding whose `cxVarName` was called at this site. */
  readonly binding: CxBinding;
}

/** A static class name: `cx('indicator')` or `cx({ active: isActive })`. */
export interface StaticClassCall extends CxCallBase {
  readonly kind: "static";
  readonly className: string;
}

/**
 * A template literal with static prefix and interpolated suffix:
 *   cx(`weight-${weight}`)
 * The parser records the literal prefix so `call-resolver` can
 * match it against the class map via `startsWith`.
 */
export interface TemplateLiteralCall extends CxCallBase {
  readonly kind: "template";
  /** Original template including `${...}` fragments. */
  readonly rawTemplate: string;
  /** Literal prefix before the first `${`. May be empty. */
  readonly staticPrefix: string;
}

/**
 * A bare identifier reference: `cx(size)` where `size` has a
 * TypeScript union-of-string-literal type. The actual resolution
 * to concrete class names is deferred to `type-resolver`.
 */
export interface VariableRefCall extends CxCallBase {
  readonly kind: "variable";
  readonly variableName: string;
}

/** Discriminated union of every `cx()` argument shape we track. */
export type CxCallInfo = StaticClassCall | TemplateLiteralCall | VariableRefCall;

// ──────────────────────────────────────────────────────────────
// Direct style property access (`styles.button`)
// ──────────────────────────────────────────────────────────────

/**
 * A direct property access on a style module default import:
 *   `styles.button` → PropertyAccessExpression
 *
 * This is the non-cx pattern: no `classnames/bind`, no `.bind()`,
 * just a raw `styles.x` reference. Detected by a separate AST
 * walker (`style-access-parser`) alongside the cx binding detector.
 */
export interface StylePropertyRef {
  readonly kind: "style-access";
  readonly className: string;
  readonly scssModulePath: string;
  readonly stylesVarName: string;
  readonly originRange: Range;
}

// ──────────────────────────────────────────────────────────────
// Type resolution
// ──────────────────────────────────────────────────────────────

/**
 * Result of resolving a TypeScript identifier to its string-literal
 * union type.
 *
 * - `kind: "union"` carries every literal member the checker saw.
 *   A single-member union (single string literal) is represented
 *   the same way, so consumers do not branch on arity.
 * - `kind: "unresolvable"` is returned when the identifier cannot
 *   be matched to a string-literal union — either because the
 *   symbol is missing, the type is not a literal union, or the
 *   program could not be built. The empty `values` array keeps
 *   the consumer code branch-free.
 */
export type ResolvedType =
  | { readonly kind: "union"; readonly values: readonly string[] }
  | { readonly kind: "unresolvable"; readonly values: readonly [] };

// ──────────────────────────────────────────────────────────────
// Reverse index
// ──────────────────────────────────────────────────────────────

/**
 * Structured classification of what a CallSite matches, used as
 * the reverse-index key. Discriminated union — the shape is
 * authoritative, no string parsing.
 */
export type CallSiteMatch =
  | { readonly kind: "static"; readonly className: string }
  | { readonly kind: "template"; readonly staticPrefix: string }
  | { readonly kind: "variable"; readonly variableName: string };

/**
 * One recorded call site of a specific class name. The
 * WorkspaceReverseIndex maps (scssFilePath, className) →
 * CallSite[] using `match.kind === "static"` to pick the
 * indexable subset.
 */
export interface CallSite {
  /** URI of the TSX/JSX/TS/JS file containing the cx() call. */
  readonly uri: string;
  /** Range covering the class token the user wrote. */
  readonly range: Range;
  /** Binding through which the call was made. */
  readonly binding: CxBinding;
  /** Structured discriminator describing the matched pattern. */
  readonly match: CallSiteMatch;
}
