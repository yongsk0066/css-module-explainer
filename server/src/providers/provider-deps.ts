import type { ScssClassMap } from "@css-module-explainer/shared";
import type { AliasResolver } from "../core/cx/alias-resolver";
import type { DocumentAnalysisCache } from "../core/indexing/document-analysis-cache";
import type { ReverseIndex } from "../core/indexing/reverse-index";
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
   * Look up the ScssClassMap for a style module file path.
   */
  readonly scssClassMapForPath: (path: string) => ScssClassMap | null;
  readonly typeResolver: TypeResolver;
  readonly reverseIndex: ReverseIndex;
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
   * depend on the workspace-wide reverse index.
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
   *
   * Only consumed by `ProviderDeps`, so the shared-closure pattern
   * used for `aliasResolver` (§3.5 of plan-wave2b.md) isn't needed
   * here — a plain field write is enough.
   */
  settings: Settings;
  /**
   * Current workspace-scoped path-alias resolver. Read-only getter
   * backed by a shared closure variable owned by composition root.
   * `rebuildAliasResolver` replaces the underlying variable so both
   * `ProviderDeps.aliasResolver` and `DocumentAnalysisCacheDeps.aliasResolver`
   * observe the fresh resolver via their getters.
   */
  readonly aliasResolver: AliasResolver;
  /**
   * Replace the current alias resolver. Callers (handler-registration's
   * reloadSettings) MUST also call `analysisCache.clear()` after
   * invoking this to discard stale entries that referenced the old
   * resolver's output.
   */
  rebuildAliasResolver(pathAlias: Readonly<Record<string, string>>): void;
}

/** No-op logError stub for tests — keeps `ProviderDeps.logError` required. */
export const NOOP_LOG_ERROR: (message: string, err: unknown) => void = () => {};
