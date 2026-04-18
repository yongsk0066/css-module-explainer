import type { TypeResolver } from "../../engine-core-ts/src/core/ts/type-resolver";
import type { TypeFactTableV1, TypeFactTableV2 } from "../../engine-core-ts/src/contracts";
import {
  collectTypeFactTableV1,
  type CollectTypeFactTableV1Options,
  type TypeFactSourceEntry,
} from "./type-fact-table-v1";
import { collectTypeFactTableV2 } from "./type-fact-table-v2";
import {
  selectTypeResolver,
  type SelectTypeResolverOptions,
  type TypeFactBackendKind,
} from "./type-backend";
import {
  collectTypeFactTableV1WithTsgoPreview,
  collectTypeFactTableV2WithTsgoPreview,
  type RunTsgoPreviewTypeFactWorker,
} from "./tsgo-preview-type-fact-collector";

export interface SelectTypeFactCollectorOptions extends SelectTypeResolverOptions {
  readonly findPreviewConfigFile?: (workspaceRoot: string) => string | null;
  readonly runPreviewTypeFactWorker?: RunTsgoPreviewTypeFactWorker;
}

export interface TypeFactCollectorSelection {
  readonly backend: TypeFactBackendKind;
  readonly typeResolver: TypeResolver;
  collectV1(options: CollectTypeFactCollectorOptions): TypeFactTableV1;
  collectV2(options: CollectTypeFactCollectorOptions): TypeFactTableV2;
}

export interface CollectTypeFactCollectorOptions {
  readonly workspaceRoot: string;
  readonly sourceEntries: readonly TypeFactSourceEntry[];
}

export function selectTypeFactCollector(
  options: SelectTypeFactCollectorOptions,
): TypeFactCollectorSelection {
  const resolverSelection = selectTypeResolver(options);

  return {
    backend: resolverSelection.backend,
    typeResolver: resolverSelection.typeResolver,
    collectV1(collectOptions) {
      if (resolverSelection.backend === "tsgo-preview") {
        return collectTypeFactTableV1WithTsgoPreview({
          ...withTypeResolver(collectOptions, resolverSelection.typeResolver),
          ...(options.findPreviewConfigFile
            ? { findConfigFile: options.findPreviewConfigFile }
            : {}),
          ...(options.runPreviewTypeFactWorker
            ? { runWorker: options.runPreviewTypeFactWorker }
            : {}),
        });
      }
      return collectTypeFactTableV1(
        withTypeResolver(collectOptions, resolverSelection.typeResolver),
      );
    },
    collectV2(collectOptions) {
      if (resolverSelection.backend === "tsgo-preview") {
        return collectTypeFactTableV2WithTsgoPreview({
          ...withTypeResolver(collectOptions, resolverSelection.typeResolver),
          ...(options.findPreviewConfigFile
            ? { findConfigFile: options.findPreviewConfigFile }
            : {}),
          ...(options.runPreviewTypeFactWorker
            ? { runWorker: options.runPreviewTypeFactWorker }
            : {}),
        });
      }
      return collectTypeFactTableV2(
        withTypeResolver(collectOptions, resolverSelection.typeResolver),
      );
    },
  };
}

function withTypeResolver(
  options: CollectTypeFactCollectorOptions,
  typeResolver: TypeResolver,
): CollectTypeFactTableV1Options {
  return {
    workspaceRoot: options.workspaceRoot,
    sourceEntries: options.sourceEntries,
    typeResolver,
  };
}
