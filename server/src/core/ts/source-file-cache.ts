import ts from "typescript";
import { contentHash } from "../util/hash.js";

interface SourceFileCacheEntry {
  hash: string;
  sourceFile: ts.SourceFile;
}

/**
 * In-flight tier of the 2-tier TypeScript strategy.
 *
 * The provider hot path needs to re-read a live editor buffer on
 * every keystroke without waiting for disk I/O. SourceFileCache
 * parses `ts.createSourceFile` once per (path, contentHash) and
 * returns the cached node on subsequent calls with the same text.
 *
 * parentNodes is always set, so consumers can walk up the tree to
 * find an enclosing function or statement (cx/binding-detector
 * relies on this).
 */
export class SourceFileCache {
  private readonly entries = new Map<string, SourceFileCacheEntry>();
  private readonly max: number;

  constructor(options: { max: number }) {
    this.max = options.max;
  }

  get(filePath: string, content: string): ts.SourceFile {
    const hash = contentHash(content);
    const cached = this.entries.get(filePath);
    if (cached && cached.hash === hash) {
      // Touch: move to the end so frequently-used files stay warm.
      this.entries.delete(filePath);
      this.entries.set(filePath, cached);
      return cached.sourceFile;
    }
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      /*setParentNodes*/ true,
      scriptKindFor(filePath),
    );
    this.put(filePath, { hash, sourceFile });
    return sourceFile;
  }

  invalidate(filePath: string): void {
    this.entries.delete(filePath);
  }

  clear(): void {
    this.entries.clear();
  }

  private put(filePath: string, entry: SourceFileCacheEntry): void {
    if (this.entries.has(filePath)) {
      this.entries.delete(filePath);
    } else if (this.entries.size >= this.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }
    this.entries.set(filePath, entry);
  }
}

/**
 * Pick the ts.ScriptKind from a file extension. Unknown extensions
 * fall back to TSX (the most permissive parser).
 */
function scriptKindFor(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".ts")) return ts.ScriptKind.TS;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (filePath.endsWith(".js")) return ts.ScriptKind.JS;
  // Unknown extensions (e.g. .mts/.cts): fall back to TSX because
  // it is the most permissive parser. Worth revisiting when the
  // first real .mts/.cts fixture lands.
  return ts.ScriptKind.TSX;
}
