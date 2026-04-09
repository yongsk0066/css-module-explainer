import * as nodeUrl from "node:url";
import type ts from "typescript";
import type { CxBinding, CxCallInfo } from "@css-module-explainer/shared";
import { contentHash } from "../util/hash.js";
import type { SourceFileCache } from "../ts/source-file-cache.js";

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
}

export interface DocumentAnalysisCacheDeps {
  readonly sourceFileCache: SourceFileCache;
  readonly detectCxBindings: (sourceFile: ts.SourceFile, filePath: string) => CxBinding[];
  readonly parseCxCalls: (sourceFile: ts.SourceFile, binding: CxBinding) => CxCallInfo[];
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
  private readonly entries = new Map<string, AnalysisEntry>();
  private readonly deps: DocumentAnalysisCacheDeps;

  constructor(deps: DocumentAnalysisCacheDeps) {
    this.deps = deps;
  }

  get(uri: string, content: string, filePath: string, version: number): AnalysisEntry {
    const cached = this.entries.get(uri);
    if (cached && cached.version === version) {
      // Exact version match — cheapest hit.
      this.touch(uri, cached);
      return cached;
    }
    const hash = contentHash(content);
    if (cached && cached.contentHash === hash) {
      // Content unchanged even though version bumped. Upgrade the
      // entry's version in place so subsequent exact-version hits
      // stay cheap, and keep the reference identity.
      const upgraded: AnalysisEntry = { ...cached, version };
      this.touch(uri, upgraded);
      return upgraded;
    }
    const entry = this.analyze(content, filePath, version, hash);
    this.put(uri, entry);
    // Single write point into the reverse index.
    this.deps.onAnalyze?.(uri, entry);
    return entry;
  }

  invalidate(uri: string): void {
    // Grab the path BEFORE deleting the entry so we can propagate
    // the invalidation to the SourceFileCache (which keys by
    // filePath, not uri).
    const cached = this.entries.get(uri);
    const filePath = cached?.sourceFile.fileName;
    this.entries.delete(uri);
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
    this.entries.clear();
    this.deps.sourceFileCache.clear();
  }

  private analyze(content: string, filePath: string, version: number, hash: string): AnalysisEntry {
    const sourceFile = this.deps.sourceFileCache.get(filePath, content);
    const bindings = this.deps.detectCxBindings(sourceFile, filePath);
    const calls = bindings.flatMap((binding) => this.deps.parseCxCalls(sourceFile, binding));
    return { version, contentHash: hash, sourceFile, bindings, calls };
  }

  private touch(uri: string, entry: AnalysisEntry): void {
    this.entries.delete(uri);
    this.entries.set(uri, entry);
  }

  private put(uri: string, entry: AnalysisEntry): void {
    if (this.entries.has(uri)) {
      this.entries.delete(uri);
    } else if (this.entries.size >= this.deps.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }
    this.entries.set(uri, entry);
  }
}
