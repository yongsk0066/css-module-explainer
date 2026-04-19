import { describe, expect, it } from "vitest";
import type { TypeResolver } from "../../../server/engine-core-ts/src/core/ts/type-resolver";
import { selectTypeFactCollector } from "../../../server/engine-host-node/src/type-fact-collector";
import type { TypeFactSourceEntry } from "../../../server/engine-host-node/src/historical/type-fact-table-v1";
import {
  makeSourceDocumentHIR,
  makeSymbolRefClassExpression,
} from "../../../server/engine-core-ts/src/core/hir/source-types";

describe("selectTypeFactCollector", () => {
  it("collects v1 and v2 facts through the selected resolver", () => {
    const collector = selectTypeFactCollector({
      typeBackend: "typescript-current",
      typeResolver: {
        resolve() {
          return { kind: "union", values: ["primary", "secondary"] };
        },
        invalidate() {},
        clear() {},
      } satisfies TypeResolver,
    });

    const sourceEntries: readonly TypeFactSourceEntry[] = [
      {
        document: {
          uri: "file:///repo/src/App.tsx",
          filePath: "/repo/src/App.tsx",
          content: "",
          version: 1,
        },
        analysis: {
          version: 1,
          contentHash: "hash",
          sourceFile: {} as TypeFactSourceEntry["analysis"]["sourceFile"],
          sourceBinder: {
            filePath: "/repo/src/App.tsx",
            scopes: [],
            decls: [],
          },
          sourceBindingGraph: {
            filePath: "/repo/src/App.tsx",
            nodes: [],
            edges: [],
          },
          sourceDocument: makeSourceDocumentHIR({
            filePath: "/repo/src/App.tsx",
            language: "tsx",
            styleImports: [],
            utilityBindings: [],
            classExpressions: [
              makeSymbolRefClassExpression(
                "expr-1",
                "cxCall",
                "/repo/src/App.module.scss",
                "variant",
                "variant",
                [],
                {
                  start: { line: 0, character: 0 },
                  end: { line: 0, character: 7 },
                },
              ),
            ],
          }),
          stylesBindings: new Map(),
          classUtilNames: [],
          sourceDependencyPaths: [],
        },
      },
    ];

    expect(collector.backend).toBe("typescript-current");
    expect(collector.collectV1({ workspaceRoot: "/repo", sourceEntries })[0]?.facts.kind).toBe(
      "finiteSet",
    );
    expect(collector.collectV2({ workspaceRoot: "/repo", sourceEntries })[0]?.facts.kind).toBe(
      "finiteSet",
    );
  });

  it("routes tsgo-preview collection through the preview worker", () => {
    const workerCalls: Array<{
      workspaceRoot: string;
      configPath: string;
      targets: readonly { filePath: string; expressionId: string; position: number }[];
    }> = [];
    const collector = selectTypeFactCollector({
      typeBackend: "tsgo-preview",
      typeResolver: {
        resolve() {
          return { kind: "unresolvable", values: [] };
        },
        invalidate() {},
        clear() {},
      } satisfies TypeResolver,
      findPreviewConfigFile: (workspaceRoot) => `${workspaceRoot}/tsconfig.json`,
      runPreviewTypeFactWorker: (input) => {
        workerCalls.push(input);
        return [
          {
            filePath: "/repo/src/App.tsx",
            expressionId: "expr-1",
            resolvedType: { kind: "union", values: ["primary", "secondary"] },
          },
        ];
      },
    });

    const sourceEntries = createSourceEntries();

    expect(collector.collectV1({ workspaceRoot: "/repo", sourceEntries })[0]?.facts.kind).toBe(
      "finiteSet",
    );
    expect(collector.collectV2({ workspaceRoot: "/repo", sourceEntries })[0]?.facts.kind).toBe(
      "finiteSet",
    );
    expect(workerCalls).toHaveLength(2);
    expect(workerCalls[0]?.configPath).toBe("/repo/tsconfig.json");
    expect(workerCalls[0]?.targets[0]?.position).toBe(0);
  });
});

function createSourceEntries(): readonly TypeFactSourceEntry[] {
  return [
    {
      document: {
        uri: "file:///repo/src/App.tsx",
        filePath: "/repo/src/App.tsx",
        content: "variant",
        version: 1,
      },
      analysis: {
        version: 1,
        contentHash: "hash",
        sourceFile: {} as TypeFactSourceEntry["analysis"]["sourceFile"],
        sourceBinder: {
          filePath: "/repo/src/App.tsx",
          scopes: [],
          decls: [],
        },
        sourceBindingGraph: {
          filePath: "/repo/src/App.tsx",
          nodes: [],
          edges: [],
        },
        sourceDocument: makeSourceDocumentHIR({
          filePath: "/repo/src/App.tsx",
          language: "tsx",
          styleImports: [],
          utilityBindings: [],
          classExpressions: [
            makeSymbolRefClassExpression(
              "expr-1",
              "cxCall",
              "/repo/src/App.module.scss",
              "variant",
              "variant",
              [],
              {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 7 },
              },
            ),
          ],
        }),
        stylesBindings: new Map(),
        classUtilNames: [],
        sourceDependencyPaths: [],
      },
    },
  ];
}
