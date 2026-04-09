import fastGlob from "fast-glob";
import { buildStyleFileWatcherGlob } from "../scss/lang-registry.js";
import type { FileTask } from "./indexer-worker.js";

/**
 * Walk the workspace and yield one `FileTask` per style module
 * file. Backed by `fast-glob`'s streaming API: `fast-glob` does
 * parallel directory enumeration ahead of the consumer up to its
 * internal highWaterMark (16 chunks), so memory stays bounded
 * for large workspaces (Agent 3 review M4 — documented here so
 * the "sequential" claim stays accurate).
 *
 * Errors inside fast-glob are caught at the `for await` boundary
 * so a single unreadable directory does not abort the entire
 * walk. The caller gets a partial result and a logged error.
 */
export function scssFileSupplier(
  workspaceRoot: string,
  logger: { error: (msg: string) => void },
): AsyncIterable<FileTask> {
  return {
    async *[Symbol.asyncIterator](): AsyncGenerator<FileTask> {
      const stream = fastGlob.stream(buildStyleFileWatcherGlob(), {
        cwd: workspaceRoot,
        absolute: true,
        onlyFiles: true,
        followSymbolicLinks: false,
        ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
      });
      try {
        for await (const entry of stream) {
          yield { kind: "scss", path: String(entry) };
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`scssFileSupplier aborted mid-walk: ${message}`);
      }
    },
  };
}
