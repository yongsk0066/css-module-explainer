import { describe, it, expect } from "vitest";
import ts from "typescript";
import {
  collectStyleImports,
  detectCxBindings,
} from "../../../server/src/core/cx/binding-detector";

function parse(source: string, filePath = "/fake/src/Button.tsx"): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    ts.ScriptKind.TSX,
  );
}

describe("detectCxBindings / standard pattern", () => {
  it("detects a plain top-level binding", () => {
    const src = parse(`
      import classNames from 'classnames/bind';
      import styles from './Button.module.scss';
      const cx = classNames.bind(styles);
    `);
    const bindings = detectCxBindings(src, "/fake/src/Button.tsx");
    expect(bindings).toHaveLength(1);
    expect(bindings[0]).toMatchObject({
      cxVarName: "cx",
      stylesVarName: "styles",
      classNamesImportName: "classNames",
    });
  });

  it("resolves relative scss paths against the filePath directory", () => {
    const src = parse(`
      import classNames from 'classnames/bind';
      import styles from './Button.module.scss';
      const cx = classNames.bind(styles);
    `);
    const bindings = detectCxBindings(src, "/fake/src/Button.tsx");
    expect(bindings[0]!.scssModulePath).toBe("/fake/src/Button.module.scss");
  });

  it("resolves ../ paths correctly", () => {
    const src = parse(`
      import classNames from 'classnames/bind';
      import styles from '../styles/Button.module.scss';
      const cx = classNames.bind(styles);
    `);
    const bindings = detectCxBindings(src, "/fake/src/components/Button.tsx");
    expect(bindings[0]!.scssModulePath).toBe("/fake/src/styles/Button.module.scss");
  });
});

describe("detectCxBindings / free variable names", () => {
  it("honors a non-'cx' variable name", () => {
    const src = parse(`
      import classNames from 'classnames/bind';
      import styles from './Button.module.scss';
      const classes = classNames.bind(styles);
    `);
    const bindings = detectCxBindings(src, "/fake/src/Button.tsx");
    expect(bindings[0]!.cxVarName).toBe("classes");
  });
});

describe("detectCxBindings / aliased classnames import", () => {
  it("detects 'cn.bind(styles)' when classnames/bind is imported as 'cn'", () => {
    const src = parse(`
      import cn from 'classnames/bind';
      import styles from './Button.module.scss';
      const cx = cn.bind(styles);
    `);
    const bindings = detectCxBindings(src, "/fake/src/Button.tsx");
    expect(bindings).toHaveLength(1);
    expect(bindings[0]!.classNamesImportName).toBe("cn");
  });

  it("ignores a .bind() call from an unrelated import", () => {
    const src = parse(`
      import cn from 'some-other-lib';
      import styles from './Button.module.scss';
      const cx = cn.bind(styles);
    `);
    const bindings = detectCxBindings(src, "/fake/src/Button.tsx");
    expect(bindings).toHaveLength(0);
  });
});

describe("detectCxBindings / free styles name", () => {
  it("honors a non-'styles' variable name", () => {
    const src = parse(`
      import classNames from 'classnames/bind';
      import btnStyles from './Button.module.scss';
      const cx = classNames.bind(btnStyles);
    `);
    const bindings = detectCxBindings(src, "/fake/src/Button.tsx");
    expect(bindings[0]!.stylesVarName).toBe("btnStyles");
  });
});

describe("detectCxBindings / multiple bindings per file", () => {
  it("detects two bindings to different style imports", () => {
    const src = parse(`
      import classNames from 'classnames/bind';
      import btnStyles from './Button.module.scss';
      import formStyles from './Form.module.scss';
      const cxBtn = classNames.bind(btnStyles);
      const cxForm = classNames.bind(formStyles);
    `);
    const bindings = detectCxBindings(src, "/fake/src/Button.tsx");
    expect(bindings).toHaveLength(2);
    const names = bindings.map((b) => b.cxVarName).toSorted();
    expect(names).toEqual(["cxBtn", "cxForm"]);
  });
});

describe("detectCxBindings / function-scoped binding", () => {
  it("detects a binding declared inside a function body", () => {
    const src = parse(`
      import classNames from 'classnames/bind';
      import styles from './Button.module.scss';

      function Button() {
        const cx = classNames.bind(styles);
        return null;
      }
    `);
    const bindings = detectCxBindings(src, "/fake/src/Button.tsx");
    expect(bindings).toHaveLength(1);
    const b = bindings[0]!;
    expect(b.cxVarName).toBe("cx");
    // Scope should be the Button function body, not the whole file.
    expect(b.scope.startLine).toBeGreaterThan(0);
    expect(b.scope.endLine).toBeGreaterThan(b.scope.startLine);
  });

  it("gives a top-level binding the file scope", () => {
    const src = parse(`
      import classNames from 'classnames/bind';
      import styles from './Button.module.scss';
      const cx = classNames.bind(styles);
    `);
    const bindings = detectCxBindings(src, "/fake/src/Button.tsx");
    const b = bindings[0]!;
    expect(b.scope.startLine).toBe(0);
    // End line should be close to the last line of source.
    expect(b.scope.endLine).toBeGreaterThanOrEqual(3);
  });
});

describe("detectCxBindings / negative cases", () => {
  it("returns [] when there is no classnames/bind import", () => {
    const src = parse(`
      import styles from './Button.module.scss';
      const cx = {};
    `);
    expect(detectCxBindings(src, "/fake/src/Button.tsx")).toEqual([]);
  });

  it("returns [] when there is no CSS module import", () => {
    const src = parse(`
      import classNames from 'classnames/bind';
      const cx = classNames.bind({});
    `);
    expect(detectCxBindings(src, "/fake/src/Button.tsx")).toEqual([]);
  });

  it("ignores a .bind() call on a different object", () => {
    const src = parse(`
      import classNames from 'classnames/bind';
      import styles from './Button.module.scss';
      const fn = console.log.bind(console);
      const cx = classNames.bind(styles);
    `);
    const bindings = detectCxBindings(src, "/fake/src/Button.tsx");
    expect(bindings).toHaveLength(1);
  });
});

describe("detectCxBindings / single-walk consolidation (4.2.c)", () => {
  // Golden-equivalence fixture for the 4.2.c refactor. Previously
  // `collectImports` walked `sourceFile.statements` twice (once via
  // `collectStyleImports`, once for classnames/bind). The consolidated
  // version walks once. This test fixes the expected CxBinding[] output
  // for a file containing BOTH import kinds so any regression in the
  // combined walk (order, lost entries, misclassified specifiers) fails
  // here.
  it("produces the expected CxBinding[] for a fixture with both classnames/bind and .module.scss imports", () => {
    const src = parse(`
      import classNames from 'classnames/bind';
      import btnStyles from './Button.module.scss';
      import formStyles from './Form.module.css';
      const cxBtn = classNames.bind(btnStyles);
      const cxForm = classNames.bind(formStyles);
    `);
    const bindings = detectCxBindings(src, "/fake/src/Button.tsx");
    // Same walk must still discover both bindings with correct
    // classNamesImportName AND correct scssModulePath.
    expect(bindings).toHaveLength(2);
    const byName = new Map(bindings.map((b) => [b.cxVarName, b]));
    expect(byName.get("cxBtn")).toMatchObject({
      cxVarName: "cxBtn",
      stylesVarName: "btnStyles",
      classNamesImportName: "classNames",
      scssModulePath: "/fake/src/Button.module.scss",
    });
    expect(byName.get("cxForm")).toMatchObject({
      cxVarName: "cxForm",
      stylesVarName: "formStyles",
      classNamesImportName: "classNames",
      scssModulePath: "/fake/src/Form.module.css",
    });
  });

  it("handles interleaved classnames/bind and style imports in a single walk", () => {
    // Intentional ordering: style import, classnames/bind, another style
    // import. The single-pass walk must not depend on encounter order.
    const src = parse(`
      import btnStyles from './Button.module.scss';
      import cn from 'classnames/bind';
      import formStyles from './Form.module.scss';
      const cx = cn.bind(formStyles);
    `);
    const bindings = detectCxBindings(src, "/fake/src/Button.tsx");
    expect(bindings).toHaveLength(1);
    expect(bindings[0]).toMatchObject({
      cxVarName: "cx",
      stylesVarName: "formStyles",
      classNamesImportName: "cn",
      scssModulePath: "/fake/src/Form.module.scss",
    });
  });
});

describe("collectStyleImports", () => {
  it("collects a default import of a .module.scss file", () => {
    const src = parse(`
      import styles from './Button.module.scss';
    `);
    const result = collectStyleImports(src, "/fake/src/Button.tsx");
    expect(result.size).toBe(1);
    expect(result.get("styles")).toBe("/fake/src/Button.module.scss");
  });

  it("collects a namespace import of a .module.scss file", () => {
    const src = parse(`
      import * as styles from './Button.module.scss';
    `);
    const result = collectStyleImports(src, "/fake/src/Button.tsx");
    expect(result.size).toBe(1);
    expect(result.get("styles")).toBe("/fake/src/Button.module.scss");
  });

  it("collects multiple style module imports", () => {
    const src = parse(`
      import btnStyles from './Button.module.scss';
      import formStyles from './Form.module.css';
    `);
    const result = collectStyleImports(src, "/fake/src/Button.tsx");
    expect(result.size).toBe(2);
    expect(result.get("btnStyles")).toBe("/fake/src/Button.module.scss");
    expect(result.get("formStyles")).toBe("/fake/src/Form.module.css");
  });

  it("handles .module.less extensions", () => {
    const src = parse(`
      import styles from './Button.module.less';
    `);
    const result = collectStyleImports(src, "/fake/src/Button.tsx");
    expect(result.size).toBe(1);
    expect(result.get("styles")).toBe("/fake/src/Button.module.less");
  });

  it("resolves ../ paths correctly", () => {
    const src = parse(`
      import styles from '../styles/Button.module.scss';
    `);
    const result = collectStyleImports(src, "/fake/src/components/Button.tsx");
    expect(result.get("styles")).toBe("/fake/src/styles/Button.module.scss");
  });

  it("ignores named imports (no default or namespace)", () => {
    const src = parse(`
      import { something } from './Button.module.scss';
    `);
    const result = collectStyleImports(src, "/fake/src/Button.tsx");
    expect(result.size).toBe(0);
  });

  it("ignores non-style-module imports", () => {
    const src = parse(`
      import React from 'react';
      import clsx from 'clsx';
      import styles from './Button.module.scss';
    `);
    const result = collectStyleImports(src, "/fake/src/Button.tsx");
    expect(result.size).toBe(1);
    expect(result.has("React")).toBe(false);
    expect(result.has("clsx")).toBe(false);
  });

  it("returns an empty map when there are no style module imports", () => {
    const src = parse(`
      import React from 'react';
      import clsx from 'clsx';
    `);
    const result = collectStyleImports(src, "/fake/src/Button.tsx");
    expect(result.size).toBe(0);
  });
});
