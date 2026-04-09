import fastGlob from "fast-glob";
import { getAllStyleExtensions } from "../scss/lang-registry.js";
import type { FileTask } from "./indexer-worker.js";

/**
 * Build the glob pattern covering every registered style module
 * extension. Today: `**\/*.module.{scss,css}`. Adding LESS later
 * is a one-entry change in `scss/lang-registry`.
 */
export function buildStyleGlob(): string {
  const exts = getAllStyleExtensions();
  // Strip the leading `.` and aggregate into a brace expression
  // when more than one — `fast-glob` supports both forms.
  const stripped = exts.map((e) => e.replace(/^\./, ""));
  if (stripped.length === 1) return `**/*.${stripped[0]}`;
  return `**/*.{${stripped.join(",")}}`;
}

/**
 * Walk the workspace and yield one `FileTask` per style module
 * file. Yields are sequential (fast-glob streaming) so the
 * IndexerWorker's `setImmediate` yield between tasks keeps LSP
 * requests preempted.
 *
 * Errors inside fast-glob are swallowed into an empty supplier —
 * an unreadable directory should not crash the worker.
 */
export function scssFileSupplier(workspaceRoot: string): AsyncIterable<FileTask> {
  return {
    async *[Symbol.asyncIterator](): AsyncGenerator<FileTask> {
      const stream = fastGlob.stream(buildStyleGlob(), {
        cwd: workspaceRoot,
        absolute: true,
        onlyFiles: true,
        followSymbolicLinks: false,
        ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
      });
      for await (const entry of stream) {
        yield { kind: "scss", path: String(entry) };
      }
    },
  };
}
