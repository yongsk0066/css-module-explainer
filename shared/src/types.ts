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
  /**
   * True if this selector was produced from a SCSS `&`-nested rule
   * whose raw source contained `&`. Flag preserved separately from
   * `bemSuffix` because some nested shapes (compound `&.active`,
   * pseudo `&:hover`, grouped children, multi-`&`) are indexed
   * without the BEM-safe rename information.
   */
  readonly isNested?: boolean;
  /**
   * Present iff this entry is a pure BEM-suffix nested rule
   * (`&--x` or `&__x`) under a bare single-class parent. When
   * present, rename uses it for a surgical suffix-only edit.
   * When absent (flat entries, or nested shapes outside the
   * BEM-safe set), rename falls back to flat-path behavior or
   * rejects via the `isNested` flag.
   */
  readonly bemSuffix?: BemSuffixInfo;
  /**
   * Present iff this entry is an alias produced by
   * `classnameTransform` (camelCase / dashes modes). Points to
   * the original SCSS key this alias was derived from.
   * `asIs`-mode entries never carry this field.
   *
   * Rename reads this to locate the original entry for SCSS
   * edit range and to chain both keys in reverse-index lookups.
   * `diagnostics.unusedSelector` skips entries with
   * `originalName !== undefined` so aliases don't double-count.
   */
  readonly originalName?: string;
}

/**
 * Information needed to rewrite a BEM-suffix nested selector
 * (`&--primary`, `&__icon`) as a surgical suffix-only edit.
 *
 * The three fields are always produced together by the parser:
 *   - rawTokenRange: source-accurate span of the `&`-fragment
 *   - rawToken: verbatim slice (e.g. `"&--primary"`)
 *   - parentResolvedName: resolved class of the enclosing bare
 *     `.classname` rule, used for suffix-math via
 *     `name.slice(parent.length)`
 *
 * Typing them as one sub-object (rather than three sibling
 * optionals on `SelectorInfo`) lets TypeScript narrow the whole
 * trio with a single `if (!info.bemSuffix)` check.
 */
export interface BemSuffixInfo {
  readonly rawTokenRange: Range;
  readonly rawToken: string;
  readonly parentResolvedName: string;
}

/** Immutable map from class name to its info, produced per style file. */
export type ScssClassMap = ReadonlyMap<string, SelectorInfo>;

/**
 * Outcome of resolving a CSS Module `import styles from '...'`
 * specifier against the filesystem. Every entry in an analysis's
 * `stylesBindings` map carries one of these variants.
 *
 * `resolved`: the target file exists on disk and its class map can
 * be loaded. `missing`: the target path was computed but the file
 * does not exist — diagnostics can underline the specifier and
 * inform the user.
 */
export type StyleImport =
  | {
      readonly kind: "resolved";
      readonly absolutePath: string;
    }
  | {
      readonly kind: "missing";
      readonly absolutePath: string;
      readonly specifier: string;
      readonly range: Range;
    };

// ──────────────────────────────────────────────────────────────
// Cx binding + call types
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

// ──────────────────────────────────────────────────────────────
// ClassRef — unified class-reference model
// ──────────────────────────────────────────────────────────────

/**
 * Which source syntax produced a class reference.
 * Deliberately a string literal union (no payload); this can be
 * widened to a discriminated union later without breaking
 * consumers that only read the discriminator.
 */
export type ClassRefOrigin = "cxCall" | "styleAccess";

/**
 * Common shape of every ClassRef variant. Internal; not exported.
 */
interface ClassRefBase {
  /**
   * LSP highlight range for the class token, quote characters
   * excluded. For `cx('indicator')` this covers `indicator` only.
   */
  readonly originRange: Range;
  /** Absolute path of the `.module.scss|css` file this ref targets. */
  readonly scssModulePath: string;
  /** Which syntax produced this ref — cx() call or direct styles.x access. */
  readonly origin: ClassRefOrigin;
}

/** A static class literal: `cx('button')` or `styles.button`. */
export interface StaticClassRef extends ClassRefBase {
  readonly kind: "static";
  /** Fully-resolved class name as written. */
  readonly className: string;
}

/**
 * A template literal with static prefix and interpolated suffix,
 * e.g. `` cx(`weight-${weight}`) ``. The literal prefix lets
 * `call-resolver` match against the class map via `startsWith`.
 */
export interface TemplateClassRef extends ClassRefBase {
  readonly kind: "template";
  /** Literal prefix before the first `${`. May be empty. */
  readonly staticPrefix: string;
  /** Original template source including `${...}` fragments. */
  readonly rawTemplate: string;
}

/**
 * A bare identifier reference: `cx(size)` where `size` has a
 * TypeScript union-of-string-literal type. Resolved by `type-resolver`.
 */
export interface VariableClassRef extends ClassRefBase {
  readonly kind: "variable";
  readonly variableName: string;
}

/**
 * A reference to a SCSS class at a specific location in source —
 * the unified model for both `cx('btn')` arguments (origin =
 * "cxCall") and direct `styles.btn` accesses (origin =
 * "styleAccess").
 */
export type ClassRef = StaticClassRef | TemplateClassRef | VariableClassRef;

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
 *
 * `static` sites carry both `className` (exact token the user
 * wrote — `btnPrimary` for `styles.btnPrimary`, `btn-primary` for
 * `cx('btn-primary')`) and `canonicalName` (the original SCSS
 * selector name — always the non-alias form). The reverse index
 * keys by `canonicalName` so a single query finds every site that
 * references a given SCSS class, regardless of which alias form
 * the user wrote. Rename uses `className` to pick the correct
 * rewrite form per site.
 */
export type CallSiteMatch =
  | {
      readonly kind: "static";
      readonly className: string;
      readonly canonicalName: string;
    }
  | { readonly kind: "template"; readonly staticPrefix: string }
  | { readonly kind: "variable"; readonly variableName: string };

/**
 * Whether a CallSite corresponds to a literal token the user wrote
 * ("direct") or a synthesized entry produced by expanding a
 * template/variable ref against a class map ("expanded").
 *
 * Rename filters out expanded sites (rewriting them would destroy
 * the template/variable source). Find References includes them.
 */
export type CallSiteExpansion = "direct" | "expanded";

// ──────────────────────────────────────────────────────────────
// Client command argument contracts
// ──────────────────────────────────────────────────────────────

/**
 * One entry in the `editor.action.showReferences` location list
 * (LSP JSON shape, before the client middleware maps it to
 * `vscode.Location`).
 */
export interface ShowReferencesLocation {
  readonly uri: string;
  readonly range: Range;
}

/**
 * Tuple contract for `editor.action.showReferences` arguments.
 *
 * VS Code's built-in command takes `(uri, position, locations)`
 * positionally, so the wire shape must be a tuple — not a single
 * object. This type documents the tuple order and lets the
 * server (`reference-lens.ts`) and the client middleware
 * (`extension.ts`) agree on a single authoritative contract,
 * replacing ad-hoc `as` casts at both ends.
 */
export type ShowReferencesArgs = readonly [
  uri: string,
  position: Position,
  locations: readonly ShowReferencesLocation[],
];

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
  /** Absolute path of the `.module.scss|css` file this site references. */
  readonly scssModulePath: string;
  /** Structured discriminator describing the matched pattern. */
  readonly match: CallSiteMatch;
  /** Whether this is a direct token or synthesized from a dynamic ref. */
  readonly expansion: CallSiteExpansion;
}
