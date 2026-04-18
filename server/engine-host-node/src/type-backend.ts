import type ts from "typescript";
import { createDefaultProgram } from "../../engine-core-ts/src/core/ts/default-program";
import {
  WorkspaceTypeResolver,
  type TypeResolver,
} from "../../engine-core-ts/src/core/ts/type-resolver";
import { TsgoPreviewTypeResolver } from "./tsgo-preview-type-resolver";

export type TypeFactBackendKind = "typescript-current" | "tsgo-preview";

export interface SelectTypeResolverOptions {
  readonly typeResolver?: TypeResolver;
  readonly typeBackend?: TypeFactBackendKind;
  readonly createProgram?: (workspaceRoot: string) => ts.Program;
  readonly env?: NodeJS.ProcessEnv;
}

export interface TypeResolverSelection {
  readonly backend: TypeFactBackendKind;
  readonly typeResolver: TypeResolver;
}

export function resolveTypeFactBackendKind(
  env: NodeJS.ProcessEnv = process.env,
): TypeFactBackendKind {
  const value = env.CME_TYPE_FACT_BACKEND ?? "typescript-current";
  if (value === "typescript-current" || value === "tsgo-preview") {
    return value;
  }

  throw new Error(`Unknown type fact backend: ${value}`);
}

export function selectTypeResolver(options: SelectTypeResolverOptions): TypeResolverSelection {
  const backend = options.typeBackend ?? resolveTypeFactBackendKind(options.env);
  if (options.typeResolver) {
    return {
      backend,
      typeResolver: options.typeResolver,
    };
  }

  if (backend === "tsgo-preview") {
    const previewOptions = options.createProgram
      ? { createProgram: options.createProgram }
      : undefined;
    return {
      backend,
      // First cut: run a real tsgo preview probe at the host boundary, then
      // delegate fine-grained symbol resolution to the current TS resolver
      // until a dedicated preview-backed resolver exists.
      typeResolver: new TsgoPreviewTypeResolver(previewOptions),
    };
  }

  return {
    backend,
    typeResolver: new WorkspaceTypeResolver({
      createProgram: options.createProgram ?? createDefaultProgram,
    }),
  };
}
