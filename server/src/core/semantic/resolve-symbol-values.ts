import type ts from "typescript";
import type { ClassRef } from "@css-module-explainer/shared";
import { resolveFlowClassValues } from "../flow/class-value-analysis";
import type { SymbolRefClassExpressionHIR } from "../hir/source-types";
import type { FlowResolution } from "../flow/lattice";
import type { TypeResolver } from "../ts/type-resolver";

interface SymbolValueResolutionEnv {
  readonly typeResolver: TypeResolver;
  readonly filePath: string;
  readonly workspaceRoot: string;
}

interface SymbolValueResolutionInput {
  readonly sourceFile: ts.SourceFile;
  readonly range: {
    readonly start: { readonly line: number; readonly character: number };
    readonly end: { readonly line: number; readonly character: number };
  };
  readonly rawReference: string;
  readonly rootName: string;
}

export function resolveSymbolClassValues(
  input: SymbolValueResolutionInput,
  env: SymbolValueResolutionEnv,
): FlowResolution | null {
  const flow = resolveFlowClassValues(input.sourceFile, input.range, input.rootName);
  if (flow) return flow;

  const resolved = env.typeResolver.resolve(env.filePath, input.rawReference, env.workspaceRoot);
  return resolved.kind === "union"
    ? { values: resolved.values, certainty: "inferred", reason: "typeUnion" }
    : null;
}

export function resolveClassRefSymbolValues(
  sourceFile: ts.SourceFile,
  ref: Extract<ClassRef, { kind: "variable" }>,
  env: SymbolValueResolutionEnv,
): FlowResolution | null {
  return resolveSymbolClassValues(
    {
      sourceFile,
      range: ref.originRange,
      rawReference: ref.variableName,
      rootName: rootNameOfReference(ref.variableName),
    },
    env,
  );
}

export function resolveSymbolExpressionValues(
  sourceFile: ts.SourceFile,
  ref: SymbolRefClassExpressionHIR,
  env: SymbolValueResolutionEnv,
): FlowResolution | null {
  return resolveSymbolClassValues(
    {
      sourceFile,
      range: ref.range,
      rawReference: ref.rawReference,
      rootName: ref.rootName,
    },
    env,
  );
}

function rootNameOfReference(reference: string): string {
  const firstDot = reference.indexOf(".");
  return firstDot === -1 ? reference : reference.slice(0, firstDot);
}
