import { describe, expect, it } from "vitest";
import type { TypeResolver } from "../../../server/engine-core-ts/src/core/ts/type-resolver";
import { selectTypeFactCollector } from "../../../server/engine-host-node/src/type-fact-collector";
import type { TypeFactSourceEntry } from "../../../server/engine-host-node/src/type-fact-table-v1";
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
});
