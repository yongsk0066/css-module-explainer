import type { ClassnameTransformMode } from "../core/scss/classname-transform";
import type { DocumentAnalysisCache } from "../core/indexing/document-analysis-cache";
import type { StyleDocumentHIR } from "../core/hir/style-types";
import type { SemanticWorkspaceReferenceIndex } from "../core/semantic/workspace-reference-index";
import type { TypeResolver } from "../core/ts/type-resolver";
import type { Settings } from "../settings";

/**
 * Identity + content of a single open document. Used by
 * document-wide computations (diagnostics) that do not care
 * about a cursor position.
 */
export interface DocumentParams {
  readonly documentUri: string;
  readonly content: string;
  readonly filePath: string;
  readonly version: number;
}

/**
 * One request's cursor location, plus the document context the
 * provider needs to resolve it. Extends `DocumentParams` so
 * cursor providers can be passed to document-wide helpers
 * without an explicit narrowing step.
 */
export interface CursorParams extends DocumentParams {
  readonly line: number;
  readonly character: number;
}

/**
 * The dependency bag every provider handler accepts.
 *
 * Composition root (server/src/composition-root.ts) builds this
 * once at startup; provider unit tests build a stub via
 * `makeBaseDeps()` in test helpers. Keeping this a plain
 * interface with no methods keeps provider tests trivial.
 */
export interface ProviderDeps {
  readonly analysisCache: DocumentAnalysisCache;
  /**
   * Look up the style-document HIR for a style module file path.
   */
  readonly styleDocumentForPath: (path: string) => StyleDocumentHIR | null;
  readonly typeResolver: TypeResolver;
  readonly semanticReferenceIndex: SemanticWorkspaceReferenceIndex;
  readonly workspaceRoot: string;
  /**
   * Log a provider-level exception. Wired to
   * `connection.console.error` in production; tests pass
   * `NOOP_LOG_ERROR`. Required so the "log + return empty
   * result" contract is explicit at every call site.
   */
  readonly logError: (message: string, err: unknown) => void;
  /**
   * Invalidate the cached style-index entry for a single file path.
   * Used by the file-watcher when a `.module.*` file changes.
   */
  readonly invalidateStyle: (path: string) => void;
  /**
   * Queue a single style file for incremental re-indexing by the
   * background indexer worker. Used by the file-watcher alongside
   * `invalidateStyle`.
   */
  readonly pushStyleFile: (path: string) => void;
  /**
   * Resolves when the initial indexer walk completes. Diagnostics
   * subscribers await this before running SCSS diagnostics that
   * depend on workspace-level reference data.
   */
  readonly indexerReady: Promise<void>;
  /**
   * Stop the background indexer worker. Called from `onShutdown`.
   */
  readonly stopIndexer: () => void;
  /**
   * Current extension settings. Plain mutable field — `reloadSettings`
   * replaces this on every `didChangeConfiguration`. Providers read
   * the field at call time so a config change between analyze calls
   * is observed on the next request.
   */
  settings: Settings;
  /**
   * Rebuild the workspace-scoped path-alias resolver against a new
   * `pathAlias` map. Callers (handler-registration's reloadSettings)
   * MUST also call `analysisCache.clear()` after invoking this to
   * discard stale entries that referenced the old resolver's output.
   * The resolver itself lives inside `DocumentAnalysisCache` — no
   * provider reads it directly.
   */
  rebuildAliasResolver(pathAlias: Readonly<Record<string, string>>): void;
  /**
   * Switch the classname-transform mode on the style-index cache
   * and clear dependent caches. Callers (handler-registration's
   * reloadSettings) must additionally call `analysisCache.clear()`
   * and reschedule open documents for the new mode to reach
   * running requests — mirroring the `rebuildAliasResolver`
   * contract.
   */
  setClassnameTransform(mode: ClassnameTransformMode): void;
}

/** No-op logError stub for tests — keeps `ProviderDeps.logError` required. */
export const NOOP_LOG_ERROR: (message: string, err: unknown) => void = () => {};
