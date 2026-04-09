import * as crypto from "node:crypto";

/**
 * Stable, opaque content hash used as a cache key across every
 * document/file cache in the server (SourceFileCache,
 * StyleIndexCache, DocumentAnalysisCache, CompletionItem cache).
 *
 * md5 is used for speed — this is NOT a cryptographic primitive.
 * Callers must treat the return value as opaque; swapping to
 * xxhash or another faster algorithm requires changing this one
 * function and nothing else.
 */
export function contentHash(content: string): string {
  return crypto.createHash("md5").update(content).digest("hex");
}
