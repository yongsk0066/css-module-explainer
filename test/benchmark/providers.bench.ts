import { bench, describe } from "vitest";
import type ts from "typescript";
import type {
  CxBinding,
  CxCallInfo,
  ScssClassMap,
  SelectorInfo,
} from "@css-module-explainer/shared";
import { SourceFileCache } from "../../server/src/core/ts/source-file-cache.js";
import { DocumentAnalysisCache } from "../../server/src/core/indexing/document-analysis-cache.js";
import { NullReverseIndex } from "../../server/src/core/indexing/reverse-index.js";
import { NOOP_LOG_ERROR, type ProviderDeps } from "../../server/src/providers/cursor-dispatch.js";
import { handleDefinition } from "../../server/src/providers/definition.js";
import { handleHover } from "../../server/src/providers/hover.js";
import { handleCompletion } from "../../server/src/providers/completion.js";
import { computeDiagnostics } from "../../server/src/providers/diagnostics.js";
import { FakeTypeResolver } from "../_fixtures/fake-type-resolver.js";

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

const parseCxCalls = (_sf: ts.SourceFile, binding: CxBinding): CxCallInfo[] => [
  {
    kind: "static",
    className: "indicator",
    originRange: { start: { line: 4, character: 26 }, end: { line: 4, character: 35 } },
    binding,
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
      detectCxBindings,
      parseCxCalls,
      max: 10,
    }),
    scssClassMapFor: () => makeClassMap(),
    scssClassMapForPath: () => null,
    typeResolver: new FakeTypeResolver(),
    reverseIndex: new NullReverseIndex(),
    workspaceRoot: "/bench",
    logError: NOOP_LOG_ERROR,
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
        detectCxBindings,
        parseCxCalls: (_sf, binding): CxCallInfo[] =>
          Array.from({ length: 100 }, (_, i) => ({
            kind: "static",
            className: `class-${i}`,
            originRange: {
              start: { line: 5 + i, character: 30 },
              end: { line: 5 + i, character: 40 },
            },
            binding,
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
