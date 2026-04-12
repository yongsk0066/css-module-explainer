import { describe, expect, it } from "vitest";
import type { ClassRef, StyleImport } from "@css-module-explainer/shared";
import { buildSourceDocumentFromLegacy } from "../../../server/src/core/hir/builders/ts-source-adapter";
import { sourceDocumentToLegacyClassRefs } from "../../../server/src/core/hir/compat/source-document-compat";

const ZERO = { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } };

describe("sourceDocumentToLegacyClassRefs", () => {
  it("round-trips legacy refs through source HIR without changing provider-facing shape", () => {
    const refs: ClassRef[] = [
      {
        kind: "static",
        origin: "cxCall",
        className: "button",
        originRange: ZERO,
        scssModulePath: "/fake/Button.module.scss",
      },
      {
        kind: "template",
        origin: "cxCall",
        rawTemplate: "size-${variant}",
        staticPrefix: "size-",
        originRange: ZERO,
        scssModulePath: "/fake/Button.module.scss",
      },
      {
        kind: "variable",
        origin: "cxCall",
        variableName: "sizes.large",
        originRange: ZERO,
        scssModulePath: "/fake/Button.module.scss",
      },
      {
        kind: "static",
        origin: "styleAccess",
        className: "indicator",
        originRange: ZERO,
        scssModulePath: "/fake/Button.module.scss",
      },
    ];

    const hir = buildSourceDocumentFromLegacy({
      filePath: "/fake/App.tsx",
      bindings: [],
      stylesBindings: new Map<string, StyleImport>(),
      classUtilNames: [],
      classRefs: refs,
    });

    expect(sourceDocumentToLegacyClassRefs(hir)).toEqual(refs);
  });
});
