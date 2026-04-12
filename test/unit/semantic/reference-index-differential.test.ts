import { pathToFileURL } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { StyleImport } from "@css-module-explainer/shared";
import {
  collectCallSites,
  WorkspaceReverseIndex,
} from "../../../server/src/core/semantic/compat/reverse-index-compat";
import { buildSourceSemanticGraph } from "../../../server/src/core/semantic/graph-builder";
import { buildSemanticReferenceIndex } from "../../../server/src/core/semantic/reference-index";
import type { AnalysisEntry } from "../../../server/src/core/indexing/document-analysis-cache";
import { FakeTypeResolver } from "../../_fixtures/fake-type-resolver";
import { loadSourceScenario, loadStyleScenario } from "../../_fixtures/scenario-corpus";

describe("semantic/reference differential", () => {
  it("matches reverse-index counts for the basic union scenario", () => {
    const sourceScenario = loadSourceScenario({
      id: "01-basic",
      sourcePath: "01-basic/BasicScenario.tsx",
    });
    const styleScenario = loadStyleScenario({
      id: "01-basic-style",
      stylePath: "01-basic/Button.module.scss",
    });

    const reverseIndex = buildReverseIndex({
      sourceScenario,
      styleScenario,
      typeResolver: new FakeTypeResolver(["sm", "md", "lg"]),
    });
    const semanticIndex = buildSemanticReferenceIndex(
      buildSourceSemanticGraph({
        sourceDocument: sourceScenario.sourceDocument,
        styleDocumentsByPath: new Map([[styleScenario.filePath, styleScenario.styleDocument]]),
        resolveSymbolValues: (ref) =>
          ref.rootName === "size"
            ? { values: ["sm", "md", "lg"], certainty: "inferred", reason: "typeUnion" }
            : null,
      }),
    );

    for (const canonicalName of canonicalNames(styleScenario)) {
      expect(semanticIndex.countSelectorReferences(styleScenario.filePath, canonicalName)).toBe(
        reverseIndex.count(styleScenario.filePath, canonicalName),
      );
    }
  });

  it("matches reverse-index counts for style-access alias references", () => {
    const sourceScenario = loadSourceScenario({
      id: "02-style-access",
      sourcePath: "02-multi-binding/StyleAccessDemo.tsx",
    });
    const styleScenario = loadStyleScenario({
      id: "02-button-camel-case",
      stylePath: "02-multi-binding/Button.module.scss",
      mode: "camelCase",
    });

    const reverseIndex = buildReverseIndex({
      sourceScenario,
      styleScenario,
      typeResolver: new FakeTypeResolver(),
    });
    const semanticIndex = buildSemanticReferenceIndex(
      buildSourceSemanticGraph({
        sourceDocument: sourceScenario.sourceDocument,
        styleDocumentsByPath: new Map([[styleScenario.filePath, styleScenario.styleDocument]]),
      }),
    );

    for (const canonicalName of canonicalNames(styleScenario)) {
      expect(semanticIndex.countSelectorReferences(styleScenario.filePath, canonicalName)).toBe(
        reverseIndex.count(styleScenario.filePath, canonicalName),
      );
    }
  });

  it("matches reverse-index counts for template-prefix expansion", () => {
    const sourceScenario = loadSourceScenario({
      id: "04-dynamic",
      sourcePath: "04-dynamic/DynamicScenario.tsx",
    });
    const styleScenario = loadStyleScenario({
      id: "04-dynamic-style",
      stylePath: "04-dynamic/DynamicKeys.module.scss",
    });

    const reverseIndex = buildReverseIndex({
      sourceScenario,
      styleScenario,
      typeResolver: new FakeTypeResolver(),
    });
    const semanticIndex = buildSemanticReferenceIndex(
      buildSourceSemanticGraph({
        sourceDocument: sourceScenario.sourceDocument,
        styleDocumentsByPath: new Map([[styleScenario.filePath, styleScenario.styleDocument]]),
      }),
    );

    for (const canonicalName of canonicalNames(styleScenario)) {
      expect(semanticIndex.countSelectorReferences(styleScenario.filePath, canonicalName)).toBe(
        reverseIndex.count(styleScenario.filePath, canonicalName),
      );
    }
  });
});

function buildReverseIndex(args: {
  sourceScenario: ReturnType<typeof loadSourceScenario>;
  styleScenario: ReturnType<typeof loadStyleScenario>;
  typeResolver: FakeTypeResolver;
}): WorkspaceReverseIndex {
  const entry: AnalysisEntry = {
    version: 1,
    contentHash: "fixture",
    sourceFile: ts.createSourceFile(
      args.sourceScenario.filePath,
      "",
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    ),
    bindings: [],
    sourceDocument: args.sourceScenario.sourceDocument,
    stylesBindings: toStyleBindingsMap(args.sourceScenario.sourceDocument.styleImports),
    classUtilNames: [],
  };
  const reverseIndex = new WorkspaceReverseIndex();
  reverseIndex.record(
    pathToFileURL(args.sourceScenario.filePath).href,
    collectCallSites(pathToFileURL(args.sourceScenario.filePath).href, entry, {
      classMapForPath: (path) =>
        path === args.styleScenario.filePath ? args.styleScenario.compatClassMap : null,
      typeResolver: args.typeResolver,
      workspaceRoot: "/fake/ws",
      filePath: args.sourceScenario.filePath,
    }),
  );
  return reverseIndex;
}

function canonicalNames(styleScenario: ReturnType<typeof loadStyleScenario>): readonly string[] {
  return Array.from(
    new Set(styleScenario.styleDocument.selectors.map((selector) => selector.canonicalName)),
  ).toSorted();
}

function toStyleBindingsMap(
  styleImports: readonly {
    readonly id: string;
    readonly localName: string;
    readonly resolved: StyleImport;
  }[],
): ReadonlyMap<string, StyleImport> {
  return new Map(styleImports.map((styleImport) => [styleImport.localName, styleImport.resolved]));
}
