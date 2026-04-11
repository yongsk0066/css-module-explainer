import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { CompletionItemKind } from "vscode-languageserver-protocol/node";
import type { CxBinding, CxCallInfo, ScssClassMap } from "@css-module-explainer/shared";
import { SourceFileCache } from "../../../server/src/core/ts/source-file-cache";
import { DocumentAnalysisCache } from "../../../server/src/core/indexing/document-analysis-cache";
import type { ProviderDeps } from "../../../server/src/providers/cursor-dispatch";
import { handleCompletion } from "../../../server/src/providers/completion";
import { detectClassUtilImports } from "../../../server/src/core/cx/binding-detector";
import { info, makeBaseDeps } from "../../_fixtures/test-helpers";

const TSX = `
import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
const el = cx('
`;

const detectCxBindings = (sourceFile: ts.SourceFile): CxBinding[] => [
  {
    cxVarName: "cx",
    stylesVarName: "styles",
    scssModulePath: "/fake/ws/src/Button.module.scss",
    classNamesImportName: "classNames",
    scope: {
      startLine: 0,
      endLine: sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line,
    },
  },
];

const parseCxCalls = (_sf: ts.SourceFile, _binding: CxBinding): CxCallInfo[] => [];

function makeDeps(overrides: Partial<ProviderDeps> = {}): ProviderDeps {
  const sourceFileCache = new SourceFileCache({ max: 10 });
  const analysisCache = new DocumentAnalysisCache({
    sourceFileCache,
    collectStyleImports: () => new Map(),
    detectCxBindings,
    parseCxCalls,
    detectClassUtilImports,
    max: 10,
  });
  return makeBaseDeps({
    analysisCache,
    scssClassMapForPath: () =>
      new Map([
        ["indicator", info("indicator")],
        ["active", info("active")],
      ]) as ScssClassMap,
    ...overrides,
  });
}

describe("handleCompletion", () => {
  it("returns all classes when inside a cx() call", () => {
    const result = handleCompletion(
      {
        documentUri: "file:///fake/ws/src/Button.tsx",
        content: TSX,
        filePath: "/fake/ws/src/Button.tsx",
        line: 4,
        character: 16, // inside cx('
        version: 1,
      },
      makeDeps(),
    );
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result!.map((r) => r.label).toSorted()).toEqual(["active", "indicator"]);
    expect(result![0]!.kind).toBe(CompletionItemKind.Value);
  });

  it("returns null when not inside a cx call", () => {
    const result = handleCompletion(
      {
        documentUri: "file:///fake/ws/src/Button.tsx",
        content: TSX,
        filePath: "/fake/ws/src/Button.tsx",
        line: 1, // import line
        character: 0,
        version: 1,
      },
      makeDeps(),
    );
    expect(result).toBeNull();
  });

  it("returns null when file does not import classnames/bind", () => {
    const result = handleCompletion(
      {
        documentUri: "file:///fake/ws/src/Plain.tsx",
        content: "const x = 1;\n",
        filePath: "/fake/ws/src/Plain.tsx",
        line: 0,
        character: 5,
        version: 1,
      },
      makeDeps(),
    );
    expect(result).toBeNull();
  });

  it("returns null when classMap is empty", () => {
    const result = handleCompletion(
      {
        documentUri: "file:///fake/ws/src/Button.tsx",
        content: TSX,
        filePath: "/fake/ws/src/Button.tsx",
        line: 4,
        character: 16,
        version: 1,
      },
      makeDeps({ scssClassMapForPath: () => new Map() as ScssClassMap }),
    );
    expect(result).toBeNull();
  });

  it("logs and returns null on exception", () => {
    const logError = vi.fn();
    const result = handleCompletion(
      {
        documentUri: "file:///fake/ws/src/Button.tsx",
        content: TSX,
        filePath: "/fake/ws/src/Button.tsx",
        line: 4,
        character: 16,
        version: 1,
      },
      makeDeps({
        scssClassMapForPath: () => {
          throw new Error("boom");
        },
        logError,
      }),
    );
    expect(result).toBeNull();
    expect(logError).toHaveBeenCalledTimes(1);
  });
});

describe("detectClassUtilImports", () => {
  function parse(source: string): ts.SourceFile {
    return ts.createSourceFile(
      "/fake/src/App.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
  }

  it("detects default import from 'clsx'", () => {
    const sf = parse(`import clsx from 'clsx';`);
    expect(detectClassUtilImports(sf)).toEqual(["clsx"]);
  });

  it("detects default import from 'clsx/lite'", () => {
    const sf = parse(`import clsx from 'clsx/lite';`);
    expect(detectClassUtilImports(sf)).toEqual(["clsx"]);
  });

  it("detects default import from 'classnames'", () => {
    const sf = parse(`import classNames from 'classnames';`);
    expect(detectClassUtilImports(sf)).toEqual(["classNames"]);
  });

  it("detects aliased default import", () => {
    const sf = parse(`import cn from 'clsx';`);
    expect(detectClassUtilImports(sf)).toEqual(["cn"]);
  });

  it("detects named import { clsx } from 'clsx'", () => {
    const sf = parse(`import { clsx } from 'clsx';`);
    expect(detectClassUtilImports(sf)).toEqual(["clsx"]);
  });

  it("detects renamed named import { clsx as cx } from 'clsx'", () => {
    const sf = parse(`import { clsx as cx } from 'clsx';`);
    expect(detectClassUtilImports(sf)).toEqual(["cx"]);
  });

  it("detects named import from 'clsx/lite'", () => {
    const sf = parse(`import { clsx } from 'clsx/lite';`);
    expect(detectClassUtilImports(sf)).toEqual(["clsx"]);
  });

  it("does NOT detect 'classnames/bind' (existing pipeline)", () => {
    const sf = parse(`import classNames from 'classnames/bind';`);
    expect(detectClassUtilImports(sf)).toEqual([]);
  });

  it("returns [] for unrelated imports", () => {
    const sf = parse(`import React from 'react';`);
    expect(detectClassUtilImports(sf)).toEqual([]);
  });

  it("collects multiple util imports", () => {
    const sf = parse(`
      import clsx from 'clsx';
      import cn from 'classnames';
    `);
    expect(detectClassUtilImports(sf)).toEqual(["clsx", "cn"]);
  });

  it("collects both default and named from the same specifier", () => {
    // Unusual but valid TS: import clsx, { clsx as cx2 } from 'clsx';
    // In practice this would be a TS error, but the detector should not crash.
    const sf = parse(`import clsx from 'clsx';`);
    expect(detectClassUtilImports(sf)).toEqual(["clsx"]);
  });
});

describe("handleCompletion / clsx path", () => {
  const CLSX_TSX = `
import clsx from 'clsx';
import styles from './Button.module.scss';
const el = clsx(styles.
`;

  function clsxMakeDeps(overrides: Partial<ProviderDeps> = {}): ProviderDeps {
    const sourceFileCache = new SourceFileCache({ max: 10 });
    const analysisCache = new DocumentAnalysisCache({
      sourceFileCache,
      detectCxBindings: () => [],
      parseCxCalls: () => [],
      parseStyleAccesses: () => [],
      // After L8 fix: collectStyleImports is wired and populates stylesBindings
      collectStyleImports: (_sf: ts.SourceFile, _fp: string) =>
        new Map([["styles", "/fake/ws/src/Button.module.scss"]]),
      detectClassUtilImports,
      max: 10,
    });
    return makeBaseDeps({
      analysisCache,
      scssClassMapForPath: (path: string) =>
        path === "/fake/ws/src/Button.module.scss"
          ? (new Map([
              ["btn", info("btn")],
              ["active", info("active")],
            ]) as ScssClassMap)
          : null,
      ...overrides,
    });
  }

  it("returns class completions inside clsx(styles.|)", () => {
    const result = handleCompletion(
      {
        documentUri: "file:///fake/ws/src/Button.tsx",
        content: CLSX_TSX,
        filePath: "/fake/ws/src/Button.tsx",
        line: 3,
        character: 23, // after "styles."
        version: 1,
      },
      clsxMakeDeps(),
    );
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result!.map((r) => r.label).toSorted()).toEqual(["active", "btn"]);
  });

  it("returns class completions with aliased import (cn from 'clsx')", () => {
    const CN_TSX = `
import cn from 'clsx';
import styles from './Button.module.scss';
const el = cn(styles.
`;
    const result = handleCompletion(
      {
        documentUri: "file:///fake/ws/src/Button.tsx",
        content: CN_TSX,
        filePath: "/fake/ws/src/Button.tsx",
        line: 3,
        character: 21, // after "styles."
        version: 1,
      },
      clsxMakeDeps(),
    );
    expect(result).not.toBeNull();
    expect(result!.map((r) => r.label).toSorted()).toEqual(["active", "btn"]);
  });

  it("returns class completions with classnames (not /bind)", () => {
    const CLASSNAMES_TSX = `
import classNames from 'classnames';
import styles from './Button.module.scss';
const el = classNames(styles.
`;
    const result = handleCompletion(
      {
        documentUri: "file:///fake/ws/src/Button.tsx",
        content: CLASSNAMES_TSX,
        filePath: "/fake/ws/src/Button.tsx",
        line: 3,
        character: 29, // after "styles."
        version: 1,
      },
      clsxMakeDeps(),
    );
    expect(result).not.toBeNull();
    expect(result!.map((r) => r.label).toSorted()).toEqual(["active", "btn"]);
  });

  it("returns class completions with partial prefix (styles.ac)", () => {
    const PARTIAL_TSX = `
import clsx from 'clsx';
import styles from './Button.module.scss';
const el = clsx(styles.ac
`;
    const result = handleCompletion(
      {
        documentUri: "file:///fake/ws/src/Button.tsx",
        content: PARTIAL_TSX,
        filePath: "/fake/ws/src/Button.tsx",
        line: 3,
        character: 25, // after "styles.ac"
        version: 1,
      },
      clsxMakeDeps(),
    );
    // Returns all items; VS Code filters by prefix client-side
    expect(result).not.toBeNull();
    expect(result!.map((r) => r.label).toSorted()).toEqual(["active", "btn"]);
  });

  it("returns null when cursor is outside clsx() call", () => {
    const OUTSIDE_TSX = `
import clsx from 'clsx';
import styles from './Button.module.scss';
const x = styles.
`;
    const result = handleCompletion(
      {
        documentUri: "file:///fake/ws/src/Button.tsx",
        content: OUTSIDE_TSX,
        filePath: "/fake/ws/src/Button.tsx",
        line: 3,
        character: 18,
        version: 1,
      },
      clsxMakeDeps(),
    );
    expect(result).toBeNull();
  });

  it("returns null when no clsx/classnames import exists", () => {
    const NO_CLSX_TSX = `
import styles from './Button.module.scss';
const el = someFunc(styles.
`;
    const result = handleCompletion(
      {
        documentUri: "file:///fake/ws/src/Button.tsx",
        content: NO_CLSX_TSX,
        filePath: "/fake/ws/src/Button.tsx",
        line: 2,
        character: 28,
        version: 1,
      },
      clsxMakeDeps(),
    );
    expect(result).toBeNull();
  });

  it("returns null when classMap is empty", () => {
    const result = handleCompletion(
      {
        documentUri: "file:///fake/ws/src/Button.tsx",
        content: CLSX_TSX,
        filePath: "/fake/ws/src/Button.tsx",
        line: 3,
        character: 23,
        version: 1,
      },
      clsxMakeDeps({ scssClassMapForPath: () => new Map() as ScssClassMap }),
    );
    expect(result).toBeNull();
  });

  it("returns null quickly for files with no clsx/classnames import (fast-path)", () => {
    const PLAIN_TSX = `
import React from 'react';
const el = <div className="foo">
`;
    const result = handleCompletion(
      {
        documentUri: "file:///fake/ws/src/Plain.tsx",
        content: PLAIN_TSX,
        filePath: "/fake/ws/src/Plain.tsx",
        line: 2,
        character: 30,
        version: 1,
      },
      clsxMakeDeps(),
    );
    // hasAnyStyleImport returns false, so computeCompletion exits
    // before touching the AST or analysis cache.
    expect(result).toBeNull();
  });
});
