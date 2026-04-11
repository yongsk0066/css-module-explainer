import { describe, expect, it } from "vitest";
import ts from "typescript";
import type {
  ClassRef,
  CxCallInfo,
  StaticClassRef,
  StylePropertyRef,
} from "@css-module-explainer/shared";
import { parseCxCalls } from "../../../server/src/core/cx/call-parser";
import { parseStylePropertyAccesses } from "../../../server/src/core/cx/style-access-parser";
import { parseClassRefs } from "../../../server/src/core/cx/class-ref-parser";
import {
  collectStyleImports,
  detectCxBindings,
} from "../../../server/src/core/cx/binding-detector";

/**
 * Golden-equivalence test for `parseClassRefs` (Wave 1 Stage 1).
 *
 * Strategy: run the legacy parsers (`parseCxCalls` +
 * `parseStylePropertyAccesses`) and the new unified
 * `parseClassRefs` on identical source fixtures, convert the
 * legacy output through the shims below, and assert deep-equal.
 * Every fixture must produce an identical `ClassRef[]` through
 * both pipelines.
 *
 * Stage 4.2.a deletes this file alongside the legacy parsers.
 */

const FILE_PATH = "/fake/src/Button.tsx";

function parseSource(source: string): ts.SourceFile {
  return ts.createSourceFile(
    FILE_PATH,
    source,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    ts.ScriptKind.TSX,
  );
}

/** Legacy → unified shim for CxCallInfo entries (always `origin: "cxCall"`). */
function cxCallInfoToClassRef(info: CxCallInfo): ClassRef {
  switch (info.kind) {
    case "static":
      return {
        kind: "static",
        origin: "cxCall",
        className: info.className,
        originRange: info.originRange,
        scssModulePath: info.scssModulePath,
      };
    case "template":
      return {
        kind: "template",
        origin: "cxCall",
        rawTemplate: info.rawTemplate,
        staticPrefix: info.staticPrefix,
        originRange: info.originRange,
        scssModulePath: info.scssModulePath,
      };
    case "variable":
      return {
        kind: "variable",
        origin: "cxCall",
        variableName: info.variableName,
        originRange: info.originRange,
        scssModulePath: info.scssModulePath,
      };
  }
}

/** Legacy → unified shim for StylePropertyRef entries (always `origin: "styleAccess"`, always static). */
function stylePropertyRefToClassRef(ref: StylePropertyRef): StaticClassRef {
  return {
    kind: "static",
    origin: "styleAccess",
    className: ref.className,
    originRange: ref.originRange,
    scssModulePath: ref.scssModulePath,
  };
}

function runLegacy(source: string): ClassRef[] {
  const sourceFile = parseSource(source);
  const bindings = detectCxBindings(sourceFile, FILE_PATH);
  const stylesBindings = collectStyleImports(sourceFile, FILE_PATH);
  const calls = bindings.flatMap((b) => parseCxCalls(sourceFile, b));
  const styleRefs = parseStylePropertyAccesses(sourceFile, stylesBindings);
  return [...calls.map(cxCallInfoToClassRef), ...styleRefs.map(stylePropertyRefToClassRef)];
}

function runUnified(source: string): ClassRef[] {
  const sourceFile = parseSource(source);
  const bindings = detectCxBindings(sourceFile, FILE_PATH);
  const stylesBindings = collectStyleImports(sourceFile, FILE_PATH);
  return parseClassRefs(sourceFile, bindings, stylesBindings);
}

function expectGoldenEquivalence(source: string): void {
  const legacy = runLegacy(source);
  const unified = runUnified(source);
  expect(unified).toEqual(legacy);
}

describe("parseClassRefs / golden equivalence vs legacy parsers", () => {
  it("fixture 1 — single static cx call", () => {
    const source = `
import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
const el = cx('button');
`;
    expectGoldenEquivalence(source);
  });

  it("fixture 2 — multi-arg cx with string + object literal", () => {
    const source = `
import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
const el = cx('button', 'primary', { active: x });
`;
    expectGoldenEquivalence(source);
  });

  it("fixture 3 — template literal cx call", () => {
    const source = `
import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
const el = cx(\`btn-\${weight}\`);
`;
    expectGoldenEquivalence(source);
  });

  it("fixture 4 — variable ref cx call", () => {
    const source = `
import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
const el = cx(size);
`;
    expectGoldenEquivalence(source);
  });

  it("fixture 5 — plain styles.x access (no cx)", () => {
    const source = `
import styles from './Button.module.scss';
const el = <div className={styles.button} />;
`;
    expectGoldenEquivalence(source);
  });

  it("fixture 6 — clsx wrapping styles.x accesses", () => {
    // Plain `clsx()` is not recognised as a cx-binding (no
    // classnames/bind import). Both pipelines pick up the
    // `styles.x` member accesses identically.
    const source = `
import clsx from 'clsx';
import styles from './Button.module.scss';
const el = <div className={clsx(styles.button, cond && styles.active)} />;
`;
    expectGoldenEquivalence(source);
  });

  it("fixture 7 — classnames wrapping a single styles.x access", () => {
    const source = `
import classnames from 'classnames';
import styles from './Button.module.scss';
const el = <div className={classnames(styles.button)} />;
`;
    expectGoldenEquivalence(source);
  });

  it("fixture 8 — nested cx call inside a function component", () => {
    const source = `
import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
function Button({ outer, inner }: { outer: string; inner: string }) {
  return <div className={cx(outer, inner)} />;
}
`;
    expectGoldenEquivalence(source);
  });

  it("fixture 9 — destructured named import from a SCSS module (out of scope for both parsers)", () => {
    const source = `
import { button } from './Button.module.scss';
const el = <div className={button} />;
`;
    expectGoldenEquivalence(source);
  });

  it("fixture 10 — aliased classnames/bind default import", () => {
    const source = `
import cn from 'classnames/bind';
import styles from './Button.module.scss';
const cx = cn.bind(styles);
const el = cx('button');
`;
    expectGoldenEquivalence(source);
  });

  it("fixture 11 — aliased clsx named import (cx2)", () => {
    // `clsx` aliased to `cx2` via a named import.  Neither parser
    // treats this as a cx binding (no classnames/bind), and both
    // pick up the styles.x child access.
    const source = `
import { clsx as cx2 } from 'clsx';
import styles from './Button.module.scss';
const el = <div className={cx2(styles.button)} />;
`;
    expectGoldenEquivalence(source);
  });

  it("fixture 12 — function-scoped cx binding", () => {
    const source = `
import classNames from 'classnames/bind';
import styles from './Button.module.scss';
function Button() {
  const cx = classNames.bind(styles);
  return <div className={cx('button')} />;
}
`;
    expectGoldenEquivalence(source);
  });
});
