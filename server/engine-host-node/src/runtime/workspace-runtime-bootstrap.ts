import { readFileSync } from "node:fs";
import type { AliasResolver } from "../../../engine-core-ts/src/core/cx/alias-resolver";
import type { StyleDocumentHIR } from "../../../engine-core-ts/src/core/hir/style-types";
import type { FileTask } from "../../../engine-core-ts/src/core/indexing/indexer-worker";
import { resolveSassModuleUseTargetFilePath } from "../../../engine-core-ts/src/core/query";
import { findLangForPath } from "../../../engine-core-ts/src/core/scss/lang-registry";
import type { StyleIndexCache } from "../../../engine-core-ts/src/core/scss/scss-index";
import type { WorkspaceStyleDependencyGraph } from "../../../engine-core-ts/src/core/semantic";
import type { TypeResolver } from "../../../engine-core-ts/src/core/ts/type-resolver";
import type { ResourceSettings } from "../../../engine-core-ts/src/settings";
import {
  selectTypeResolver,
  type SelectTypeResolverOptions,
  type TypeFactBackendKind,
} from "../type-backend";
import type { WorkspaceRuntimeIO } from "./workspace-runtime";

export interface RuntimeTypeResolverOptions extends SelectTypeResolverOptions {}

export interface StyleDocumentLookupArgs {
  readonly styleIndexCache: StyleIndexCache;
  readonly styleDependencyGraph: WorkspaceStyleDependencyGraph;
  readonly readOpenDocumentText: (path: string) => string | null;
  readonly readStyleFile: (path: string) => string | null;
  readonly fileExists: (path: string) => boolean;
  readonly aliasResolverForPath?: (path: string) => AliasResolver | null;
  readonly getModeForPath: (path: string) => ResourceSettings["scss"]["classnameTransform"];
}

export interface WorkspaceRuntimeIOOptions {
  readonly readStyleFile: (path: string) => string | null;
  readonly readStyleFileAsync?: (path: string) => Promise<string | null>;
  readonly fileSupplier?: () => AsyncIterable<FileTask>;
}

export function createRuntimeTypeResolver(options: RuntimeTypeResolverOptions): TypeResolver {
  return selectTypeResolver(options).typeResolver;
}

export function resolveRuntimeTypeBackend(
  options: RuntimeTypeResolverOptions,
): TypeFactBackendKind {
  return selectTypeResolver(options).backend;
}

export function createStyleDocumentLookup(
  args: StyleDocumentLookupArgs,
): (path: string) => StyleDocumentHIR | null {
  return (path: string): StyleDocumentHIR | null => {
    if (!findLangForPath(path)) return null;
    const buffered = args.readOpenDocumentText(path);
    const mode = args.getModeForPath(path);
    if (buffered !== null) {
      const styleDocument = args.styleIndexCache.getStyleDocument(path, buffered, mode);
      args.styleDependencyGraph.record(path, styleDocument, {
        resolveSassModuleUseTargetFilePath: (moduleUse) =>
          resolveSassModuleUseTargetFilePath(
            path,
            moduleUse,
            args.aliasResolverForPath?.(path) ?? undefined,
            args.fileExists,
          ),
      });
      return styleDocument;
    }
    const content = args.readStyleFile(path);
    if (content === null) return null;
    const styleDocument = args.styleIndexCache.getStyleDocument(path, content, mode);
    args.styleDependencyGraph.record(path, styleDocument, {
      resolveSassModuleUseTargetFilePath: (moduleUse) =>
        resolveSassModuleUseTargetFilePath(
          path,
          moduleUse,
          args.aliasResolverForPath?.(path) ?? undefined,
          args.fileExists,
        ),
    });
    return styleDocument;
  };
}

export function createWorkspaceRuntimeIO(options: WorkspaceRuntimeIOOptions): WorkspaceRuntimeIO {
  return {
    readStyleFile: options.readStyleFile,
    ...(options.readStyleFileAsync ? { readStyleFileAsync: options.readStyleFileAsync } : {}),
    ...(options.fileSupplier ? { fileSupplier: options.fileSupplier } : {}),
  };
}

export function defaultReadStyleFile(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}
