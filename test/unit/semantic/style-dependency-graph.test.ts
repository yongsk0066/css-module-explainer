import { describe, expect, it } from "vitest";
import { parseStyleDocument } from "../../../server/engine-core-ts/src/core/scss/scss-parser";
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

  it("records incoming Sass module member references", () => {
    const graph = new WorkspaceStyleDependencyGraph();
    const filePath = "/fake/button.module.scss";
    const targetPath = "/fake/_tokens.module.scss";
    const styleDocument = parseStyleDocument(
      `@use "./tokens.module" as tokens;

.button {
  color: tokens.$gap;
}`,
      filePath,
    );

    graph.record(filePath, styleDocument, {
      resolveSassModuleUseTargetFilePath: () => targetPath,
    });

    expect(graph.getIncomingSassModuleMemberRefs(targetPath, "variable", "gap")).toEqual([
      {
        filePath,
        namespace: "tokens",
        symbolKind: "variable",
        name: "gap",
        range: {
          start: { line: 3, character: 16 },
          end: { line: 3, character: 20 },
        },
      },
    ]);
  });

  it("records incoming wildcard Sass module member references", () => {
    const graph = new WorkspaceStyleDependencyGraph();
    const filePath = "/fake/button.module.scss";
    const targetPath = "/fake/_tokens.module.scss";
    const styleDocument = parseStyleDocument(
      `@use "./tokens.module" as *;

.button {
  color: $gap;
}`,
      filePath,
    );

    graph.record(filePath, styleDocument, {
      resolveSassModuleUseTargetFilePath: () => targetPath,
    });

    expect(graph.getIncomingSassModuleMemberRefs(targetPath, "variable", "gap")).toEqual([
      {
        filePath,
        namespace: "*",
        symbolKind: "variable",
        name: "gap",
        range: {
          start: { line: 3, character: 9 },
          end: { line: 3, character: 13 },
        },
      },
    ]);
  });

  it("records incoming Sass module member references against forwarded targets", () => {
    const graph = new WorkspaceStyleDependencyGraph();
    const filePath = "/fake/button.module.scss";
    const themePath = "/fake/theme.module.scss";
    const targetPath = "/fake/_tokens.module.scss";
    const styleDocument = parseStyleDocument(
      `@use "./theme.module" as *;

.button {
  color: $gap;
}`,
      filePath,
    );

    graph.record(filePath, styleDocument, {
      resolveSassModuleUseTargetFilePath: () => themePath,
      resolveSassModuleExportedSymbolTargetFilePaths: () => [targetPath],
    });

    expect(graph.getIncomingSassModuleMemberRefs(targetPath, "variable", "gap")).toEqual([
      {
        filePath,
        namespace: "*",
        symbolKind: "variable",
        name: "gap",
        range: {
          start: { line: 3, character: 9 },
          end: { line: 3, character: 13 },
        },
      },
    ]);
    expect(graph.getIncomingSassModuleMemberRefs(themePath, "variable", "gap")).toEqual([]);
  });

  it("records prefixed forwarded Sass module references against the original target name", () => {
    const graph = new WorkspaceStyleDependencyGraph();
    const filePath = "/fake/button.module.scss";
    const targetPath = "/fake/_tokens.module.scss";
    const styleDocument = parseStyleDocument(
      `@use "./theme.module" as *;

.button {
  color: $theme-gap;
}`,
      filePath,
    );

    graph.record(filePath, styleDocument, {
      resolveSassModuleExportedSymbolTargets: (_moduleUse, symbolKind, name) =>
        symbolKind === "variable" && name === "theme-gap"
          ? [{ filePath: targetPath, name: "gap" }]
          : [],
    });

    expect(graph.getIncomingSassModuleMemberRefs(targetPath, "variable", "gap")).toEqual([
      {
        filePath,
        namespace: "*",
        symbolKind: "variable",
        name: "gap",
        range: {
          start: { line: 3, character: 9 },
          end: { line: 3, character: 19 },
        },
      },
    ]);
    expect(graph.getIncomingSassModuleMemberRefs(targetPath, "variable", "theme-gap")).toEqual([]);
  });
});
