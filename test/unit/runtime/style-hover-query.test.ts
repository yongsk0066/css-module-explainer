import { describe, expect, it } from "vitest";
import type { StyleDocumentHIR } from "../../../server/engine-core-ts/src/core/hir/style-types";
import { parseStyleDocument } from "../../../server/engine-core-ts/src/core/scss/scss-parser";
import { WorkspaceStyleDependencyGraph } from "../../../server/engine-core-ts/src/core/semantic/style-dependency-graph";
import { WorkspaceSemanticWorkspaceReferenceIndex } from "../../../server/engine-core-ts/src/core/semantic/workspace-reference-index";
import {
  resolveStyleHoverResult,
  resolveStyleSelectorHoverResult,
} from "../../../server/engine-host-node/src/style-hover-query";
import { infoAtLine, makeBaseDeps, semanticSiteAt } from "../../_fixtures/test-helpers";

const SCSS_PATH = "/fake/ws/src/Button.module.scss";
const TOKENS_PATH = "/fake/ws/src/tokens.module.scss";

describe("style hover query", () => {
  it("uses rust selector-usage payloads for style hover summaries", () => {
    const deps = makeBaseDeps({
      selectorMapForPath: () => new Map([["indicator", infoAtLine("indicator", 5)]]),
      workspaceRoot: "/fake/ws",
    });

    const result = resolveStyleSelectorHoverResult(
      {
        filePath: SCSS_PATH,
        line: 5,
        character: 3,
      },
      deps,
      {
        env: { CME_SELECTED_QUERY_BACKEND: "rust-selector-usage" } as NodeJS.ProcessEnv,
        readRustSelectorUsagePayloadForWorkspaceTarget: () => ({
          canonicalName: "indicator",
          totalReferences: 4,
          directReferenceCount: 2,
          editableDirectReferenceCount: 1,
          exactReferenceCount: 1,
          inferredOrBetterReferenceCount: 3,
          hasExpandedReferences: true,
          hasStyleDependencyReferences: true,
          hasAnyReferences: true,
        }),
      },
    );

    expect(result).not.toBeNull();
    expect(result?.usageSummary).toMatchObject({
      totalReferences: 4,
      directReferenceCount: 2,
      hasExpandedReferences: true,
      hasStyleDependencyReferences: true,
      hasAnyReferences: true,
    });
  });

  it("falls back to semantic selector usage when rust payload is unavailable", () => {
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///fake/ws/src/App.tsx", [
      semanticSiteAt("file:///fake/ws/src/App.tsx", "indicator", 10, SCSS_PATH),
    ]);
    const deps = makeBaseDeps({
      selectorMapForPath: () => new Map([["indicator", infoAtLine("indicator", 5)]]),
      workspaceRoot: "/fake/ws",
      semanticReferenceIndex,
    });

    const result = resolveStyleSelectorHoverResult(
      {
        filePath: SCSS_PATH,
        line: 5,
        character: 3,
      },
      deps,
      {
        env: { CME_SELECTED_QUERY_BACKEND: "rust-selector-usage" } as NodeJS.ProcessEnv,
        readRustSelectorUsagePayloadForWorkspaceTarget: () => null,
      },
    );

    expect(result).not.toBeNull();
    expect(result?.usageSummary).toMatchObject({
      totalReferences: 1,
      directReferenceCount: 1,
      hasExpandedReferences: false,
      hasStyleDependencyReferences: false,
      hasAnyReferences: true,
    });
  });

  it("resolves animation references to keyframes hover data", () => {
    const scss = `@keyframes fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.box {
  animation: fade 1s linear;
}

.pulse {
  animation-name: fade;
}
`;
    const result = resolveStyleHoverResult(
      {
        filePath: SCSS_PATH,
        line: 6,
        character: 15,
      },
      makeBaseDeps({
        styleDocumentForPath: styleDocumentMap([parseStyleDocument(scss, SCSS_PATH)]),
      }),
    );

    expect(result).toMatchObject({
      kind: "keyframes",
      scssModulePath: SCSS_PATH,
      headingName: "fade",
      note: "Referenced via `animation`",
      referenceCount: 2,
    });
  });

  it("resolves imported value references to value hover data", () => {
    const buttonScss = `@value primary from "./tokens.module.scss";

.button {
  color: primary;
}
`;
    const tokensScss = `@value primary: #ff3355;`;
    const result = resolveStyleHoverResult(
      {
        filePath: SCSS_PATH,
        line: 3,
        character: 10,
      },
      makeBaseDeps({
        styleDocumentForPath: styleDocumentMap([
          parseStyleDocument(buttonScss, SCSS_PATH),
          parseStyleDocument(tokensScss, TOKENS_PATH),
        ]),
      }),
    );

    expect(result).toMatchObject({
      kind: "value",
      scssModulePath: TOKENS_PATH,
      headingName: "primary",
      note: "Referenced via `declaration value`; imported from `./tokens.module.scss` as `primary`",
      referenceCount: 1,
    });
  });

  it("resolves same-file Sass symbol references to declaration hover data", () => {
    const scss = `$gap: 1rem;
.button {
  color: $gap;
}
`;
    const result = resolveStyleHoverResult(
      {
        filePath: SCSS_PATH,
        line: 2,
        character: 10,
      },
      makeBaseDeps({
        styleDocumentForPath: styleDocumentMap([parseStyleDocument(scss, SCSS_PATH)]),
      }),
    );

    expect(result).toMatchObject({
      kind: "sassSymbol",
      scssModulePath: SCSS_PATH,
      headingName: "gap",
      note: "Referenced via Sass reference",
      referenceCount: 1,
    });
  });

  it("resolves namespace-qualified Sass member references to target module hover data", () => {
    const buttonScss = `@use "./tokens.module" as tokens;

.button {
  color: tokens.$gap;
  margin: tokens.$gap;
}
`;
    const tokensScss = `$gap: 1rem;`;
    const result = resolveStyleHoverResult(
      {
        filePath: SCSS_PATH,
        line: 3,
        character: 18,
      },
      makeBaseDeps({
        styleDocumentForPath: styleDocumentMap([
          parseStyleDocument(buttonScss, SCSS_PATH),
          parseStyleDocument(tokensScss, TOKENS_PATH),
        ]),
      }),
    );

    expect(result).toMatchObject({
      kind: "sassSymbol",
      scssModulePath: TOKENS_PATH,
      headingName: "tokens.gap",
      note: "Referenced via Sass module reference",
      referenceCount: 2,
    });
  });

  it("counts namespace-qualified Sass member references from declaration hover data", () => {
    const buttonScss = `@use "./tokens.module" as tokens;

.button {
  color: tokens.$gap;
  margin: tokens.$gap;
}
`;
    const tokensScss = `$gap: 1rem;`;
    const styleDocument = parseStyleDocument(buttonScss, SCSS_PATH);
    const targetDocument = parseStyleDocument(tokensScss, TOKENS_PATH);
    const styleDependencyGraph = new WorkspaceStyleDependencyGraph();
    styleDependencyGraph.record(SCSS_PATH, styleDocument, {
      resolveSassModuleUseTargetFilePath: () => TOKENS_PATH,
    });

    const result = resolveStyleHoverResult(
      {
        filePath: TOKENS_PATH,
        line: 0,
        character: 1,
      },
      makeBaseDeps({
        styleDocumentForPath: styleDocumentMap([styleDocument, targetDocument]),
        styleDependencyGraph,
      }),
    );

    expect(result).toMatchObject({
      kind: "sassSymbol",
      scssModulePath: TOKENS_PATH,
      referenceCount: 2,
    });
  });
});

function styleDocumentMap(documents: readonly StyleDocumentHIR[]) {
  const byPath = new Map(documents.map((document) => [document.filePath, document]));
  return (filePath: string) => byPath.get(filePath) ?? null;
}
