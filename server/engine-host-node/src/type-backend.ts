import type ts from "typescript";
import { createDefaultProgram } from "../../engine-core-ts/src/core/ts/default-program";
import {
  WorkspaceTypeResolver,
  type TypeResolver,
} from "../../engine-core-ts/src/core/ts/type-resolver";
import { TsgoProbeTypeResolver } from "./tsgo-probe-type-resolver";

export type TypeFactBackendKind = "typescript-current" | "tsgo";

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
  const value = env.CME_TYPE_FACT_BACKEND ?? "tsgo";
  if (value === "typescript-current" || value === "tsgo") {
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

  if (backend === "tsgo") {
    const probeOptions = options.createProgram
      ? { createProgram: options.createProgram }
      : undefined;
    return {
      backend,
      // Keep the TS7 backend selected by default, but avoid synchronous
      // full-workspace TypeScript program construction on the LSP request
      // path. Fine-grained direct misses return unresolvable unless tests or
      // explicit callers inject a current-TS fallback.
      typeResolver: new TsgoProbeTypeResolver(probeOptions),
    };
  }

  return {
    backend,
    typeResolver: new WorkspaceTypeResolver({
      createProgram: options.createProgram ?? createDefaultProgram,
    }),
  };
}
