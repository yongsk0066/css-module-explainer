import fastGlob from "fast-glob";
import { buildStyleFileWatcherGlob } from "../scss/lang-registry";
import type { FileTask } from "./indexer-worker";

/** Yields one FileTask per style module file in the workspace. */
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
