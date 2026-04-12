import ts from "typescript";
import type { Range } from "@css-module-explainer/shared";
import { buildFlowSlice } from "./flow-slice";
import {
  exactValue,
  mergeValues,
  toFlowResolution,
  type ClassValueLattice,
  type FlowResolution,
} from "./lattice";
import type { FlowNode } from "./cfg";

type FlowEnv = Map<string, ClassValueLattice>;

interface FlowState {
  readonly env: FlowEnv;
  readonly terminated: boolean;
}

export function resolveFlowClassValues(
  sourceFile: ts.SourceFile,
  range: Range,
  variableName: string,
): FlowResolution | null {
  const slice = buildFlowSlice(sourceFile, range, variableName);
  if (!slice) return null;

  const result = analyzeNodes(slice.nodes, new Map());
  return toFlowResolution(result.env.get(variableName) ?? null);
}

function analyzeNodes(nodes: readonly FlowNode[], incoming: FlowEnv): FlowState {
  let env = cloneEnv(incoming);
  let terminated = false;

  for (const node of nodes) {
    if (terminated) break;

    switch (node.kind) {
      case "assignment": {
        const resolved = resolveExpression(node.expression, env);
        if (resolved) {
          env.set(node.variableName, resolved);
        } else {
          env.delete(node.variableName);
        }
        break;
      }
      case "branch": {
        if (node.referenceLocation === "then") {
          return analyzeNodes(node.thenNodes, env);
        }
        if (node.referenceLocation === "else") {
          return analyzeNodes(node.elseNodes, env);
        }

        const thenState = analyzeNodes(node.thenNodes, env);
        const elseState =
          node.elseNodes.length > 0
            ? analyzeNodes(node.elseNodes, env)
            : { env, terminated: false };
        const merged = mergeEnvs(env, thenState, elseState);
        env = merged.env;
        terminated = merged.terminated;
        break;
      }
      case "terminate":
        terminated = true;
        break;
      default:
        node satisfies never;
        break;
    }
  }

  return { env, terminated };
}

function resolveExpression(
  expression: ts.Expression | null,
  env: FlowEnv,
): ClassValueLattice | null {
  if (!expression) return null;

  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return exactValue(expression.text);
  }

  if (ts.isIdentifier(expression)) {
    return env.get(expression.text) ?? null;
  }

  if (ts.isParenthesizedExpression(expression)) {
    return resolveExpression(expression.expression, env);
  }

  if (ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression)) {
    return resolveExpression(expression.expression, env);
  }

  if (ts.isConditionalExpression(expression)) {
    const whenTrue = resolveExpression(expression.whenTrue, env);
    const whenFalse = resolveExpression(expression.whenFalse, env);
    const merged = mergeValues(whenTrue, whenFalse);
    return merged ? { values: merged.values, branched: true } : null;
  }

  return null;
}

function mergeEnvs(base: FlowEnv, left: FlowState, right: FlowState): FlowState {
  if (left.terminated && right.terminated) {
    return { env: new Map(), terminated: true };
  }
  if (left.terminated) return { env: cloneEnv(right.env), terminated: right.terminated };
  if (right.terminated) return { env: cloneEnv(left.env), terminated: left.terminated };

  const merged = cloneEnv(base);
  const keys = new Set([...left.env.keys(), ...right.env.keys(), ...base.keys()]);
  for (const key of keys) {
    const value = mergeValues(left.env.get(key) ?? null, right.env.get(key) ?? null);
    if (value) {
      merged.set(key, value);
    } else {
      merged.delete(key);
    }
  }
  return { env: merged, terminated: false };
}

function cloneEnv(env: FlowEnv): FlowEnv {
  return new Map(
    Array.from(env.entries(), ([key, value]) => [key, { ...value, values: [...value.values] }]),
  );
}
