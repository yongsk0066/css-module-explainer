import { describe, expect, it } from "vitest";
import { buildSourceSemanticGraph } from "../../../server/src/core/semantic/graph-builder";
import { buildSemanticReferenceIndex } from "../../../server/src/core/semantic/reference-index";
import { loadSourceScenario, loadStyleScenario } from "../../_fixtures/scenario-corpus";

describe("buildSemanticReferenceIndex", () => {
  it("returns direct and inferred selector references from the source graph", () => {
    const sourceScenario = loadSourceScenario({
      id: "01-basic",
      sourcePath: "01-basic/BasicScenario.tsx",
    });
    const styleScenario = loadStyleScenario({
      id: "01-basic-style",
      stylePath: "01-basic/Button.module.scss",
    });

    const graph = buildSourceSemanticGraph({
      sourceDocument: sourceScenario.sourceDocument,
      styleDocumentsByPath: new Map([[styleScenario.filePath, styleScenario.styleDocument]]),
      resolveSymbolValues: (ref) => (ref.rootName === "size" ? ["sm", "md", "lg"] : []),
    });
    const index = buildSemanticReferenceIndex(graph);

    expect(index.findSelectorReferences(styleScenario.filePath, "button")).toEqual([
      expect.objectContaining({
        refId: "class-expr:0",
        origin: "cxCall",
        canonicalName: "button",
        className: "button",
        certainty: "exact",
        reason: "literal",
        expansion: "direct",
      }),
      expect.objectContaining({
        refId: "class-expr:4",
        origin: "cxCall",
        canonicalName: "button",
        className: "button",
        certainty: "exact",
        reason: "literal",
        expansion: "direct",
      }),
      expect.objectContaining({
        refId: "class-expr:7",
        origin: "cxCall",
        canonicalName: "button",
        className: "button",
        certainty: "exact",
        reason: "literal",
        expansion: "direct",
      }),
    ]);

    expect(index.findSelectorReferences(styleScenario.filePath, "sm")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          refId: "class-expr:2",
          canonicalName: "sm",
          className: "sm",
          certainty: "inferred",
          reason: "typeUnion",
          expansion: "expanded",
        }),
        expect.objectContaining({
          refId: "class-expr:6",
          canonicalName: "sm",
          className: "sm",
          certainty: "inferred",
          reason: "typeUnion",
          expansion: "expanded",
        }),
      ]),
    );
    expect(index.countSelectorReferences(styleScenario.filePath, "sm")).toBe(2);
    expect(
      index.findSelectorReferences(styleScenario.filePath, "sm", { minimumCertainty: "exact" }),
    ).toEqual([]);
    expect(index.findTargetsForRef("class-expr:2")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalName: "sm",
          certainty: "inferred",
          reason: "typeUnion",
        }),
        expect.objectContaining({
          canonicalName: "md",
          certainty: "inferred",
          reason: "typeUnion",
        }),
        expect.objectContaining({
          canonicalName: "lg",
          certainty: "inferred",
          reason: "typeUnion",
        }),
      ]),
    );
  });

  it("resolves style-access aliases back to the canonical selector", () => {
    const sourceScenario = loadSourceScenario({
      id: "02-style-access",
      sourcePath: "02-multi-binding/StyleAccessDemo.tsx",
    });
    const styleScenario = loadStyleScenario({
      id: "02-button-camel-case",
      stylePath: "02-multi-binding/Button.module.scss",
      mode: "camelCase",
    });

    const graph = buildSourceSemanticGraph({
      sourceDocument: sourceScenario.sourceDocument,
      styleDocumentsByPath: new Map([[styleScenario.filePath, styleScenario.styleDocument]]),
    });
    const index = buildSemanticReferenceIndex(graph);

    expect(index.findSelectorReferences(styleScenario.filePath, "button--primary")).toEqual([
      expect.objectContaining({
        refId: "class-expr:1",
        origin: "styleAccess",
        canonicalName: "button--primary",
        className: "buttonPrimary",
        certainty: "exact",
        reason: "styleAccess",
        expansion: "direct",
      }),
    ]);
  });

  it("collects inferred template-prefix matches for dynamic refs", () => {
    const sourceScenario = loadSourceScenario({
      id: "04-dynamic",
      sourcePath: "04-dynamic/DynamicScenario.tsx",
    });
    const styleScenario = loadStyleScenario({
      id: "04-dynamic-style",
      stylePath: "04-dynamic/DynamicKeys.module.scss",
    });

    const graph = buildSourceSemanticGraph({
      sourceDocument: sourceScenario.sourceDocument,
      styleDocumentsByPath: new Map([[styleScenario.filePath, styleScenario.styleDocument]]),
    });
    const index = buildSemanticReferenceIndex(graph);

    expect(index.findTargetsForRef("class-expr:0")).toEqual([
      expect.objectContaining({
        canonicalName: "btn-danger",
        certainty: "inferred",
        reason: "templatePrefix",
      }),
      expect.objectContaining({
        canonicalName: "btn-primary",
        certainty: "inferred",
        reason: "templatePrefix",
      }),
      expect.objectContaining({
        canonicalName: "btn-secondary",
        certainty: "inferred",
        reason: "templatePrefix",
      }),
    ]);

    expect(
      index.findAllForScssPath(styleScenario.filePath, { minimumCertainty: "inferred" }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          refId: "class-expr:0",
          canonicalName: "btn-primary",
          certainty: "inferred",
        }),
      ]),
    );
  });
});
