import type { StyleDocumentHIR } from "../../../src/core/hir/style-types";
import { scssFileSupplier } from "../../../src/core/indexing/file-supplier";
import type { FileTask } from "../../../src/core/indexing/indexer-worker";
import { IndexerWorker } from "../../../src/core/indexing/indexer-worker";
import type { ResourceSettings } from "../../../src/settings";
import type { SharedRuntimeCaches } from "./shared-runtime-caches";
import { createScopedRuntimeLogger, type RuntimeSink } from "./runtime-sink";

export interface WorkspaceStyleRuntimeIO {
  readonly readStyleFile: (path: string) => string | null;
  readonly readStyleFileAsync?: (path: string) => Promise<string | null>;
  readonly fileSupplier?: () => AsyncIterable<FileTask>;
}

export interface WorkspaceStyleRuntimeArgs {
  readonly workspaceRoot: string;
  readonly caches: SharedRuntimeCaches;
  readonly io: WorkspaceStyleRuntimeIO;
  readonly sink: RuntimeSink;
  readonly serverName: string;
  readonly getModeForStylePath: (path: string) => ResourceSettings["scss"]["classnameTransform"];
  readonly isOwnedStylePath: (stylePath: string) => boolean;
}

export interface WorkspaceStyleRuntime {
  readonly indexerReady: Promise<void>;
  invalidateStyle(stylePath: string): void;
  peekStyleDocument(
    stylePath: string,
    mode: ResourceSettings["scss"]["classnameTransform"],
  ): StyleDocumentHIR | null;
  buildStyleDocument(
    stylePath: string,
    content: string,
    mode: ResourceSettings["scss"]["classnameTransform"],
  ): StyleDocumentHIR;
  pushStyleFile(stylePath: string): void;
  stop(): void;
}

export function createWorkspaceStyleRuntime(
  args: WorkspaceStyleRuntimeArgs,
): WorkspaceStyleRuntime {
  const logger = createScopedRuntimeLogger(args.sink, `[${args.serverName}:indexer] `);
  const supplier =
    args.io.fileSupplier ??
    (() => scssFileSupplier(args.workspaceRoot, logger, args.isOwnedStylePath));
  const readFile = args.io.readStyleFileAsync ?? defaultReadStyleFileAsync;
  const indexerWorker = new IndexerWorker({
    supplier,
    readFile,
    onScssFile: (stylePath, content) => {
      const styleDocument = args.caches.styleIndexCache.getStyleDocument(
        stylePath,
        content,
        args.getModeForStylePath(stylePath),
      );
      args.caches.styleDependencyGraph.record(stylePath, styleDocument);
    },
    logger,
  });
  indexerWorker.start().catch((err: unknown) => {
    args.sink.error(
      `[${args.serverName}] indexer worker crashed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  });

  return {
    indexerReady: indexerWorker.ready,
    invalidateStyle(stylePath: string): void {
      args.caches.styleIndexCache.invalidate(stylePath);
      args.caches.styleDependencyGraph.forget(stylePath);
    },
    peekStyleDocument(
      stylePath: string,
      mode: ResourceSettings["scss"]["classnameTransform"],
    ): StyleDocumentHIR | null {
      return args.caches.styleIndexCache.peekEntry(stylePath, mode)?.styleDocument ?? null;
    },
    buildStyleDocument(
      stylePath: string,
      content: string,
      mode: ResourceSettings["scss"]["classnameTransform"],
    ): StyleDocumentHIR {
      return args.caches.styleIndexCache.getStyleDocument(stylePath, content, mode);
    },
    pushStyleFile(stylePath: string): void {
      indexerWorker.pushFile({ path: stylePath });
    },
    stop(): void {
      indexerWorker.stop();
    },
  };
}

async function defaultReadStyleFileAsync(stylePath: string): Promise<string | null> {
  const { readFile } = await import("node:fs/promises");
  try {
    return await readFile(stylePath, "utf8");
  } catch {
    return null;
  }
}
