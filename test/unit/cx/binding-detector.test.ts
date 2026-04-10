import { describe, it, expect } from "vitest";
import ts from "typescript";
import { detectCxBindings } from "../../../server/src/core/cx/binding-detector.js";

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
