import { describe, expect, it } from "vitest";
import { WorkspaceStyleDependencyGraph } from "../../../server/engine-core-ts/src/core/semantic/style-dependency-graph";
import { buildStyleDocumentFromSelectorMap } from "../../_fixtures/style-documents";
import { infoAtLine as info } from "../../_fixtures/test-helpers";

describe("WorkspaceStyleDependencyGraph", () => {
  it("records same-file composes edges", () => {
    const graph = new WorkspaceStyleDependencyGraph();
    const filePath = "/fake/button.module.scss";
    graph.record(
      filePath,
      buildStyleDocumentFromSelectorMap(
        filePath,
        new Map([
          ["base", info("base", 1)],
          ["button", { ...info("button", 5), composes: [{ classNames: ["base"] }] }],
        ]),
      ),
    );

    expect(graph.getIncoming(filePath, "base")).toEqual([
      {
        filePath,
        canonicalName: "button",
        reason: "localComposes",
      },
    ]);
  });

  it("records cross-file composes edges", () => {
    const graph = new WorkspaceStyleDependencyGraph();
    graph.record(
      "/fake/button.module.scss",
      buildStyleDocumentFromSelectorMap(
        "/fake/button.module.scss",
        new Map([
          [
            "button",
            {
              ...info("button", 5),
              composes: [{ classNames: ["base"], from: "./base.module.scss" }],
            },
          ],
        ]),
      ),
    );

    expect(graph.getIncoming("/fake/base.module.scss", "base")).toEqual([
      {
        filePath: "/fake/button.module.scss",
        canonicalName: "button",
        reason: "crossFileComposes",
      },
    ]);
  });
});
