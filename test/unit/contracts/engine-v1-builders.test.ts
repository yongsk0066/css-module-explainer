import { describe, expect, it } from "vitest";
import { makeSymbolRefClassExpression } from "../../../server/engine-core-ts/src/core/hir/source-types";
import type { SourceBindingGraph } from "../../../server/engine-core-ts/src/core/binder/source-binding-graph";
import {
  buildSourceBindingGraphSnapshotV1,
  createTypeFactTableEntryV1,
  normalizeResolvedTypeToTypeFactsV1,
} from "../../../server/engine-core-ts/src/contracts";

describe("engine-v1 builders", () => {
  it("builds a minimal binding graph snapshot", () => {
    const graph: SourceBindingGraph = {
      filePath: "/repo/src/App.tsx",
      nodes: [
        {
          id: "decl:cx",
          kind: "decl",
          filePath: "/repo/src/App.tsx",
          decl: {
            id: "cx",
            kind: "localVar",
            scopeId: "scope:root",
            name: "cx",
            filePath: "/repo/src/App.tsx",
            span: { start: 0, end: 2 },
          },
        },
        {
          id: "expression:expr-1",
          kind: "expression",
          filePath: "/repo/src/App.tsx",
          expression: makeSymbolRefClassExpression(
            "expr-1",
            "cxCall",
            "/repo/src/App.module.scss",
            "size",
            "size",
            [],
            {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 4 },
            },
            "cx",
          ),
        },
      ],
      edges: [
        {
          from: "expression:expr-1",
          to: "decl:cx",
          kind: "expressionUsesDecl",
        },
      ],
    };

    expect(buildSourceBindingGraphSnapshotV1(graph)).toEqual({
      declarations: [{ id: "cx", name: "cx", kind: "localVar" }],
      resolutions: [{ expressionId: "expr-1", declarationId: "cx" }],
    });
  });

  it("normalizes resolved types into contract facts", () => {
    expect(normalizeResolvedTypeToTypeFactsV1({ kind: "unresolvable", values: [] })).toEqual({
      kind: "unknown",
    });
    expect(normalizeResolvedTypeToTypeFactsV1({ kind: "union", values: ["sm"] })).toEqual({
      kind: "exact",
      values: ["sm"],
    });
    expect(
      normalizeResolvedTypeToTypeFactsV1({ kind: "union", values: ["lg", "sm", "lg"] }),
    ).toEqual({
      kind: "finiteSet",
      values: ["lg", "sm"],
    });
  });

  it("creates type fact entries", () => {
    expect(
      createTypeFactTableEntryV1("/repo/src/App.tsx", "expr-1", {
        kind: "union",
        values: ["primary", "secondary"],
      }),
    ).toEqual({
      filePath: "/repo/src/App.tsx",
      expressionId: "expr-1",
      facts: {
        kind: "finiteSet",
        values: ["primary", "secondary"],
      },
    });
  });
});
