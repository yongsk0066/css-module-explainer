import { describe, expect, it } from "vitest";
import type ts from "typescript";
import type { CxBinding } from "../../../server/engine-core-ts/src/core/cx/cx-types";
import type { ResolvedCxBinding } from "../../../server/engine-core-ts/src/core/cx/resolved-bindings";
import { DocumentAnalysisCache } from "../../../server/engine-core-ts/src/core/indexing/document-analysis-cache";
import { SourceFileCache } from "../../../server/engine-core-ts/src/core/ts/source-file-cache";
import type { ProviderDeps } from "../../../server/lsp-server/src/providers/cursor-dispatch";
import { resolveSourceDiagnosticFindings } from "../../../server/engine-host-node/src/source-diagnostics-query";
import { FakeTypeResolver } from "../../_fixtures/fake-type-resolver";
import {
  EMPTY_ALIAS_RESOLVER,
  buildTestClassExpressions,
  info,
  makeBaseDeps,
} from "../../_fixtures/test-helpers";

const TSX = `
import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
const value = cx('unknonw');
`;

const detectCxBindings = (_sourceFile: ts.SourceFile): CxBinding[] => [
  {
    cxVarName: "cx",
    stylesVarName: "styles",
    scssModulePath: "/fake/ws/src/Button.module.scss",
    classNamesImportName: "classNames",
    bindingRange: {
      start: { line: 3, character: 6 },
      end: { line: 3, character: 8 },
    },
  },
];

const parseClassExpressions = (_sf: ts.SourceFile, bindings: readonly ResolvedCxBinding[]) =>
  buildTestClassExpressions({
    filePath: "/fake/ws/src/Button.tsx",
    bindings,
    expressions:
      bindings.length === 0
        ? []
        : [
            {
              kind: "literal",
              origin: "cxCall",
              className: "unknonw",
              range: { start: { line: 4, character: 17 }, end: { line: 4, character: 26 } },
              scssModulePath: bindings[0]!.scssModulePath,
            },
          ],
  });

function makeDeps(): ProviderDeps {
  const sourceFileCache = new SourceFileCache({ max: 10 });
  const analysisCache = new DocumentAnalysisCache({
    sourceFileCache,
    fileExists: () => true,
    aliasResolver: EMPTY_ALIAS_RESOLVER,
    scanCxImports: (sf, fp) => ({ stylesBindings: new Map(), bindings: detectCxBindings(sf, fp) }),
    parseClassExpressions,
    max: 10,
  });
  return makeBaseDeps({
    analysisCache,
    selectorMapForPath: () =>
      new Map([
        ["indicator", info("indicator")],
        ["unknown", info("unknown")],
      ]),
    typeResolver: new FakeTypeResolver(),
    workspaceRoot: "/fake/ws",
  });
}

describe("resolveSourceDiagnosticFindings", () => {
  it("returns source checker findings through the host boundary", () => {
    const findings = resolveSourceDiagnosticFindings(
      {
        documentUri: "file:///fake/ws/src/Button.tsx",
        content: TSX,
        filePath: "/fake/ws/src/Button.tsx",
        version: 1,
      },
      makeDeps(),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      code: "missing-static-class",
      className: "unknonw",
      suggestion: "unknown",
    });
  });
});
