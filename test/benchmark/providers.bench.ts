import { bench, describe } from "vitest";
import type ts from "typescript";
import type { ClassRef, CxBinding, ScssClassMap, SelectorInfo } from "@css-module-explainer/shared";
import { SourceFileCache } from "../../server/src/core/ts/source-file-cache";
import { DocumentAnalysisCache } from "../../server/src/core/indexing/document-analysis-cache";
import { NullReverseIndex } from "../../server/src/core/indexing/reverse-index";
import { NOOP_LOG_ERROR, type ProviderDeps } from "../../server/src/providers/cursor-dispatch";
import { handleDefinition } from "../../server/src/providers/definition";
import { handleHover } from "../../server/src/providers/hover";
import { handleCompletion } from "../../server/src/providers/completion";
import { computeDiagnostics } from "../../server/src/providers/diagnostics";
import { FakeTypeResolver } from "../_fixtures/fake-type-resolver";

const BUTTON_TSX = `
import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function Button() {
  return <div className={cx('indicator')}>hi</div>;
}
`;

const LARGE_TSX = `
import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function Component() {
  return (
    <div>
${Array.from({ length: 100 }, (_, i) => `      <div className={cx('class-${i}')}>item ${i}</div>`).join("\n")}
    </div>
  );
}
`;

function info(name: string): SelectorInfo {
  return {
    name,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: name.length } },
    fullSelector: `.${name}`,
    declarations: "color: red",
    ruleRange: { start: { line: 0, character: 0 }, end: { line: 2, character: 1 } },
  };
}

const detectCxBindings = (sourceFile: ts.SourceFile): CxBinding[] => [
  {
    cxVarName: "cx",
    stylesVarName: "styles",
    scssModulePath: "/bench/Button.module.scss",
    classNamesImportName: "classNames",
    scope: {
      startLine: 0,
      endLine: sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line,
    },
  },
];

const parseClassRefs = (_sf: ts.SourceFile, bindings: readonly CxBinding[]): ClassRef[] =>
  bindings.length === 0
    ? []
    : [
        {
          kind: "static",
          origin: "cxCall",
          className: "indicator",
          originRange: { start: { line: 4, character: 26 }, end: { line: 4, character: 35 } },
          scssModulePath: bindings[0]!.scssModulePath,
        },
      ];

function makeClassMap(): ScssClassMap {
  const entries = new Map<string, SelectorInfo>();
  entries.set("indicator", info("indicator"));
  for (let i = 0; i < 200; i += 1) {
    entries.set(`class-${i}`, info(`class-${i}`));
  }
  return entries;
}

function makeDeps(): ProviderDeps {
  const sourceFileCache = new SourceFileCache({ max: 10 });
  return {
    analysisCache: new DocumentAnalysisCache({
      sourceFileCache,
      collectStyleImports: () => new Map(),
      fileExists: () => true,
      detectCxBindings,
      parseClassRefs,
      max: 10,
    }),
    scssClassMapForPath: () => makeClassMap(),
    typeResolver: new FakeTypeResolver(),
    reverseIndex: new NullReverseIndex(),
    workspaceRoot: "/bench",
    logError: NOOP_LOG_ERROR,
    invalidateStyle: () => {},
    pushStyleFile: () => {},
    indexerReady: Promise.resolve(),
    stopIndexer: () => {},
  };
}

describe("provider cold hover", () => {
  bench("handleHover cold", () => {
    const deps = makeDeps();
    handleHover(
      {
        documentUri: "file:///bench/Button.tsx",
        content: BUTTON_TSX,
        filePath: "/bench/Button.tsx",
        line: 4,
        character: 30,
        version: 1,
      },
      deps,
    );
  });

  bench("handleHover warm (cache hit)", () => {
    const deps = makeDeps();
    const params = {
      documentUri: "file:///bench/Button.tsx",
      content: BUTTON_TSX,
      filePath: "/bench/Button.tsx",
      line: 4,
      character: 30,
      version: 1,
    };
    handleHover(params, deps); // warm
    handleHover(params, deps); // hit
  });

  bench("handleDefinition cold", () => {
    const deps = makeDeps();
    handleDefinition(
      {
        documentUri: "file:///bench/Button.tsx",
        content: BUTTON_TSX,
        filePath: "/bench/Button.tsx",
        line: 4,
        character: 30,
        version: 1,
      },
      deps,
    );
  });

  bench("handleCompletion cold", () => {
    const deps = makeDeps();
    handleCompletion(
      {
        documentUri: "file:///bench/Button.tsx",
        content: BUTTON_TSX,
        filePath: "/bench/Button.tsx",
        line: 4,
        character: 30,
        version: 1,
      },
      deps,
    );
  });
});

describe("diagnostics document-wide scan", () => {
  bench("computeDiagnostics — small file (1 call)", () => {
    const deps = makeDeps();
    computeDiagnostics(
      {
        documentUri: "file:///bench/Button.tsx",
        content: BUTTON_TSX,
        filePath: "/bench/Button.tsx",
        version: 1,
      },
      deps,
    );
  });

  bench("computeDiagnostics — large file (100 calls, large classMap)", () => {
    const deps: ProviderDeps = {
      ...makeDeps(),
      analysisCache: new DocumentAnalysisCache({
        sourceFileCache: new SourceFileCache({ max: 10 }),
        collectStyleImports: () => new Map(),
        fileExists: () => true,
        detectCxBindings,
        parseClassRefs: (_sf, bindings): ClassRef[] =>
          bindings.length === 0
            ? []
            : Array.from({ length: 100 }, (_, i) => ({
                kind: "static",
                origin: "cxCall",
                className: `class-${i}`,
                originRange: {
                  start: { line: 5 + i, character: 30 },
                  end: { line: 5 + i, character: 40 },
                },
                scssModulePath: bindings[0]!.scssModulePath,
              })),
        max: 10,
      }),
    };
    computeDiagnostics(
      {
        documentUri: "file:///bench/Large.tsx",
        content: LARGE_TSX,
        filePath: "/bench/Large.tsx",
        version: 1,
      },
      deps,
    );
  });
});
