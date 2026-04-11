import * as nodeUrl from "node:url";
import type ts from "typescript";
import type {
  ClassRef,
  CxBinding,
  CxCallInfo,
  StylePropertyRef,
} from "@css-module-explainer/shared";
import { contentHash } from "../util/hash";
import { LruMap } from "../util/lru-map";
import type { SourceFileCache } from "../ts/source-file-cache";

/**
 * Single-parse analysis result for one TS/JS source file.
 *
 * Providers receive this object from `DocumentAnalysisCache.get`
 * and treat it as read-only. The `version` field mirrors VS Code's
 * `TextDocument.version` — cache hits on matching version are
 * O(1), with a content-hash fallback for the "same content, new
 * version" case that happens during incremental sync edge cases.
 */
export interface AnalysisEntry {
  readonly version: number;
  readonly contentHash: string;
  readonly sourceFile: ts.SourceFile;
  readonly bindings: readonly CxBinding[];
  readonly calls: readonly CxCallInfo[];
  /** Direct `styles.className` property accesses (non-cx pattern). */
  readonly styleRefs: readonly StylePropertyRef[];
  /**
   * Unified class-reference list (Wave 1). Emitted by
   * `parseClassRefs` alongside the legacy `calls`/`styleRefs`
   * arrays during the Stage 1–2 dual-pipeline window. A dev-only
   * invariant in `analyze()` asserts
   * `classRefs.length === calls.length + styleRefs.length`.
   */
  readonly classRefs: readonly ClassRef[];
  /** Map of style-import local name → resolved absolute SCSS path. */
  readonly stylesBindings: ReadonlyMap<string, string>;
}

export interface DocumentAnalysisCacheDeps {
  readonly sourceFileCache: SourceFileCache;
  readonly collectStyleImports: (
    sourceFile: ts.SourceFile,
    filePath: string,
  ) => ReadonlyMap<string, string>;
  readonly detectCxBindings: (sourceFile: ts.SourceFile, filePath: string) => CxBinding[];
  readonly parseCxCalls: (sourceFile: ts.SourceFile, binding: CxBinding) => CxCallInfo[];
  readonly parseStyleAccesses?: (
    sourceFile: ts.SourceFile,
    stylesBindings: ReadonlyMap<string, string>,
  ) => StylePropertyRef[];
  /**
   * Unified ClassRef producer (Wave 1). Optional so test helpers
   * that construct a cache without wiring Wave 1 still work — the
   * cache falls back to `[]` and skips the dev-only invariant.
   */
  readonly parseClassRefs?: (
    sourceFile: ts.SourceFile,
    bindings: readonly CxBinding[],
    stylesBindings: ReadonlyMap<string, string>,
  ) => ClassRef[];
  readonly max: number;
  /**
   * Callback fired exactly once per (uri, version) when the cache
   * produces a fresh AnalysisEntry. Wired to
   * `WorkspaceReverseIndex.record` so each document contributes
   * its cx() call sites to the reverse index once per document
   * update — not once per hover/def/completion keystroke.
   */
  readonly onAnalyze?: (uri: string, entry: AnalysisEntry) => void;
}

/**
 * The single-parse hub for every provider hot path.
 *
 * `get(uri, content, filePath, version)` returns an AnalysisEntry
 * containing the AST, bindings, and all cx() calls. The cache
 * guarantees that `ts.createSourceFile + detectCxBindings +
 * parseCxCalls` run at most once per (uri, version) — same-version
 * repeat calls are O(1), and a content-hash fallback catches the
 * case where the version bumped but the actual text is identical.
 *
 * This class is the "one parse per file" enforcement point.
 * Providers never call `ts.createSourceFile` directly — every
 * analysis goes through this cache.
 */
export class DocumentAnalysisCache {
  private readonly lru: LruMap<string, AnalysisEntry>;
  private readonly deps: DocumentAnalysisCacheDeps;

  constructor(deps: DocumentAnalysisCacheDeps) {
    this.deps = deps;
    this.lru = new LruMap(deps.max);
  }

  get(uri: string, content: string, filePath: string, version: number): AnalysisEntry {
    const cached = this.lru.get(uri);
    if (cached && cached.version === version) {
      // Exact version match — cheapest hit.
      this.lru.touch(uri, cached);
      return cached;
    }
    const hash = contentHash(content);
    if (cached && cached.contentHash === hash) {
      // Content unchanged even though version bumped. Upgrade the
      // entry's version in place so subsequent exact-version hits
      // stay cheap, and keep the reference identity.
      const upgraded: AnalysisEntry = { ...cached, version };
      this.lru.touch(uri, upgraded);
      return upgraded;
    }
    const entry = this.analyze(content, filePath, version, hash);
    this.lru.set(uri, entry);
    // Single write point into the reverse index.
    this.deps.onAnalyze?.(uri, entry);
    return entry;
  }

  invalidate(uri: string): void {
    // Grab the path BEFORE deleting the entry so we can propagate
    // the invalidation to the SourceFileCache (which keys by
    // filePath, not uri).
    const cached = this.lru.get(uri);
    const filePath = cached?.sourceFile.fileName;
    this.lru.delete(uri);
    if (filePath !== undefined) {
      this.deps.sourceFileCache.invalidate(filePath);
      return;
    }
    // Fallback: no entry existed, derive the path from the uri.
    try {
      const derived = nodeUrl.fileURLToPath(uri);
      this.deps.sourceFileCache.invalidate(derived);
    } catch {
      // Malformed URI — nothing to invalidate anyway.
    }
  }

  clear(): void {
    this.lru.clear();
    this.deps.sourceFileCache.clear();
  }

  private analyze(content: string, filePath: string, version: number, hash: string): AnalysisEntry {
    const sourceFile = this.deps.sourceFileCache.get(filePath, content);
    const bindings = this.deps.detectCxBindings(sourceFile, filePath);
    const calls = bindings.flatMap((binding) => this.deps.parseCxCalls(sourceFile, binding));

    // Independent style-import scanning: collect style imports independently of cx bindings.
    // Files without classnames/bind now get styles.x support.
    const stylesBindings = this.deps.collectStyleImports(sourceFile, filePath);
    const styleRefs = this.deps.parseStyleAccesses?.(sourceFile, stylesBindings) ?? [];

    // Wave 1 dual-pipeline window: the unified parser runs
    // alongside the legacy parsers. Stage 4.2.a deletes the
    // legacy arrays once providers all read `classRefs`.
    const classRefs = this.deps.parseClassRefs?.(sourceFile, bindings, stylesBindings) ?? [];

    if (this.deps.parseClassRefs && process.env.NODE_ENV !== "production") {
      if (classRefs.length !== calls.length + styleRefs.length) {
        throw new Error(
          `ClassRef/legacy count mismatch in ${filePath}: classRefs=${classRefs.length}, calls=${calls.length}, styleRefs=${styleRefs.length}`,
        );
      }
    }

    return {
      version,
      contentHash: hash,
      sourceFile,
      bindings,
      calls,
      styleRefs,
      classRefs,
      stylesBindings,
    };
  }
}
