import * as nodeUrl from "node:url";
import type ts from "typescript";
import type { ClassRef, CxBinding, StyleImport } from "@css-module-explainer/shared";
import { buildSourceDocumentFromLegacy } from "../hir/builders/ts-source-adapter";
import { sourceDocumentToLegacyClassRefs } from "../hir/compat/source-document-compat";
import type { SourceDocumentHIR } from "../hir/source-types";
import { contentHash } from "../util/hash";
import { LruMap } from "../util/lru-map";
import type { SourceFileCache } from "../ts/source-file-cache";
import type { AliasResolver } from "../cx/alias-resolver";

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
  /**
   * Unified class-reference list. Produced by `parseClassRefs` —
   * covers both cx() call arguments (`origin: "cxCall"`) and
   * direct `styles.x` property access (`origin: "styleAccess"`).
   */
  readonly classRefs: readonly ClassRef[];
  /**
   * Wave 1 document-level source HIR. This is compatibility-backed
   * for now: it is derived from the current scan/parser outputs so
   * provider behavior stays stable while the HIR layer is introduced.
   */
  readonly sourceDocument: SourceDocumentHIR;
  /**
   * Map of style-import local name → resolution outcome. The
   * `resolved` variant carries the absolute SCSS path; the
   * `missing` variant adds the raw specifier + LSP range so the
   * diagnostics provider can underline the broken import.
   */
  readonly stylesBindings: ReadonlyMap<string, StyleImport>;
  /**
   * Local identifiers bound to `clsx`, `clsx/lite`, or `classnames`
   * imports (NOT `classnames/bind`). Used by the completion provider
   * to detect whether the cursor sits inside a class-util call. Empty
   * when the file has no such imports.
   */
  readonly classUtilNames: readonly string[];
}

export interface DocumentAnalysisCacheDeps {
  readonly sourceFileCache: SourceFileCache;
  /**
   * Single-pass scan of the file's top-level import declarations
   * and cx binding initializers. Returns both the style-import
   * map (with `resolved`/`missing` variants derived from
   * `fileExists`) and the active `cx = classnames.bind(styles)`
   * bindings in one traversal, eliminating the previous
   * double-walk pattern.
   */
  readonly scanCxImports: (
    sourceFile: ts.SourceFile,
    filePath: string,
    fileExists: (p: string) => boolean,
    aliasResolver: AliasResolver,
  ) => {
    readonly stylesBindings: ReadonlyMap<string, StyleImport>;
    readonly bindings: readonly CxBinding[];
  };
  /**
   * Returns true iff `path` exists on disk. Injected so tests can
   * stub the check and the analysis cache stays free of `node:fs`.
   * Composition root wires `fs.existsSync`.
   */
  readonly fileExists: (path: string) => boolean;
  /**
   * Read-only accessor for the current workspace-scoped path-alias
   * resolver. Returns the latest resolver — `rebuildAliasResolver`
   * in composition root replaces the shared closure variable, so
   * `analyze()` always observes fresh alias config.
   */
  readonly aliasResolver: AliasResolver;
  /**
   * Unified ClassRef producer. Optional so test helpers that
   * construct a cache without wiring the class-ref parser still
   * work — the cache falls back to `[]`.
   */
  readonly parseClassRefs?: (
    sourceFile: ts.SourceFile,
    bindings: readonly CxBinding[],
    stylesBindings: ReadonlyMap<string, StyleImport>,
  ) => ClassRef[];
  /**
   * Detect `clsx` / `clsx/lite` / `classnames` (not `/bind`) imports
   * and return their local identifier names. Optional for test
   * helpers that don't care about completion; falls back to `[]`.
   */
  readonly detectClassUtilImports?: (sourceFile: ts.SourceFile) => readonly string[];
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
 * containing the AST, bindings, and all class references. The cache
 * guarantees that `ts.createSourceFile + detectCxBindings +
 * parseClassRefs` run at most once per (uri, version) — same-version
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
    // Single-pass scan: resolves style imports (with `missing`
    // variants via `fileExists`) and collects cx bindings in one
    // traversal of the source file. Files without `classnames/bind`
    // still get a populated `stylesBindings` so `parseClassRefs`
    // can resolve `styles.x` accesses.
    const { stylesBindings, bindings } = this.deps.scanCxImports(
      sourceFile,
      filePath,
      this.deps.fileExists,
      this.deps.aliasResolver,
    );

    // Unified class-ref parser — covers both cx() arguments and styles.x accesses.
    const parsedClassRefs = this.deps.parseClassRefs?.(sourceFile, bindings, stylesBindings) ?? [];

    const classUtilNames = this.deps.detectClassUtilImports?.(sourceFile) ?? [];
    const sourceDocument = buildSourceDocumentFromLegacy({
      filePath,
      bindings,
      stylesBindings,
      classUtilNames,
      classRefs: parsedClassRefs,
    });
    const classRefs = sourceDocumentToLegacyClassRefs(sourceDocument);

    return {
      version,
      contentHash: hash,
      sourceFile,
      bindings,
      classRefs,
      sourceDocument,
      stylesBindings,
      classUtilNames,
    };
  }
}
