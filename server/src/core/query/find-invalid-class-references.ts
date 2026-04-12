import type { ClassRef, ScssClassMap } from "@css-module-explainer/shared";
import { findClosestMatch } from "../util/text-utils";
import type { TypeResolver } from "../ts/type-resolver";
import { resolveClassRefSymbolValues } from "../semantic/resolve-symbol-values";
import type ts from "typescript";

export interface InvalidClassReferenceQueryEnv {
  readonly typeResolver: TypeResolver;
  readonly filePath: string;
  readonly workspaceRoot: string;
}

export type InvalidClassReferenceFinding =
  | {
      readonly kind: "missingStaticClass";
      readonly ref: Extract<ClassRef, { kind: "static" }>;
      readonly range: Extract<ClassRef, { kind: "static" }>["originRange"];
      readonly suggestion?: string;
    }
  | {
      readonly kind: "missingTemplatePrefix";
      readonly ref: Extract<ClassRef, { kind: "template" }>;
      readonly range: Extract<ClassRef, { kind: "template" }>["originRange"];
    }
  | {
      readonly kind: "missingResolvedClassValues";
      readonly ref: Extract<ClassRef, { kind: "variable" }>;
      readonly range: Extract<ClassRef, { kind: "variable" }>["originRange"];
      readonly missingValues: readonly string[];
      readonly certainty: "exact" | "inferred" | "possible";
      readonly reason: "flowLiteral" | "flowBranch" | "typeUnion";
    };

export function findInvalidClassReference(
  ref: ClassRef,
  sourceFile: ts.SourceFile,
  classMap: ScssClassMap,
  env: InvalidClassReferenceQueryEnv,
): InvalidClassReferenceFinding | null {
  if (ref.origin !== "cxCall") return null;

  switch (ref.kind) {
    case "static": {
      if (classMap.has(ref.className)) return null;
      const suggestion = findClosestMatch(ref.className, classMap.keys());
      return {
        kind: "missingStaticClass",
        ref,
        range: ref.originRange,
        ...(suggestion ? { suggestion } : {}),
      };
    }
    case "template": {
      if (anyValueStartsWith(classMap, ref.staticPrefix)) return null;
      return {
        kind: "missingTemplatePrefix",
        ref,
        range: ref.originRange,
      };
    }
    case "variable": {
      const resolved = resolveClassRefSymbolValues(sourceFile, ref, env);
      if (!resolved) return null;
      const missingValues = resolved.values.filter((value) => !classMap.has(value));
      if (missingValues.length === 0) return null;
      return {
        kind: "missingResolvedClassValues",
        ref,
        range: ref.originRange,
        missingValues,
        certainty: resolved.certainty,
        reason: resolved.reason,
      };
    }
    default:
      ref satisfies never;
      return null;
  }
}

function anyValueStartsWith(classMap: ScssClassMap, prefix: string): boolean {
  for (const name of classMap.keys()) {
    if (name.startsWith(prefix)) return true;
  }
  return false;
}
