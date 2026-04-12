import { describe, expect, it } from "vitest";
import type { ClassRef, CxBinding, StyleImport } from "@css-module-explainer/shared";
import { buildSourceDocumentFromLegacy } from "../../../server/src/core/hir/compat/source-document-builder-compat";

const ZERO = { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } };

function binding(): CxBinding {
  return {
    cxVarName: "cx",
    stylesVarName: "styles",
    scssModulePath: "/fake/Button.module.scss",
    classNamesImportName: "classNames",
    scope: { startLine: 0, endLine: 20 },
  };
}

describe("buildSourceDocumentFromLegacy", () => {
  it("maps variable refs to structured symbol refs with path segments", () => {
    const refs: ClassRef[] = [
      {
        kind: "variable",
        origin: "cxCall",
        variableName: "sizes.large",
        originRange: ZERO,
        scssModulePath: "/fake/Button.module.scss",
      },
    ];

    const hir = buildSourceDocumentFromLegacy({
      filePath: "/fake/App.tsx",
      bindings: [binding()],
      stylesBindings: new Map<string, StyleImport>(),
      classUtilNames: [],
      classRefs: refs,
    });

    expect(hir.language).toBe("typescriptreact");
    expect(hir.classExpressions).toHaveLength(1);
    expect(hir.classExpressions[0]).toMatchObject({
      kind: "symbolRef",
      rawReference: "sizes.large",
      rootName: "sizes",
      pathSegments: ["large"],
    });
  });

  it("keeps direct styles access separate from cx literals", () => {
    const refs: ClassRef[] = [
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
      stylesBindings: new Map([
        [
          "styles",
          { kind: "resolved", absolutePath: "/fake/Button.module.scss" } satisfies StyleImport,
        ],
      ]),
      classUtilNames: ["clsx"],
      classRefs: refs,
    });

    expect(hir.styleImports).toHaveLength(1);
    expect(hir.utilityBindings).toEqual([
      {
        kind: "classUtil",
        id: "utility-binding:util:0",
        localName: "clsx",
      },
    ]);
    expect(hir.classExpressions[0]).toMatchObject({
      kind: "styleAccess",
      className: "indicator",
      accessPath: ["indicator"],
      origin: "styleAccess",
    });
  });
});
