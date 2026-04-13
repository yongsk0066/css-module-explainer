import { describe, expect, it } from "vitest";
import ts from "typescript";
import { scanCxImports } from "../../../server/src/core/cx/binding-detector";
import { parseClassExpressions } from "../../../server/src/core/cx/class-ref-parser";
import { resolveCxBindings } from "../../../server/src/core/cx/resolved-bindings";
import { AliasResolver } from "../../../server/src/core/cx/alias-resolver";
import { buildSourceBinder } from "../../../server/src/core/binder/binder-builder";

const EMPTY_ALIAS_RESOLVER = new AliasResolver("/fake", {});

function parse(source: string, filePath = "/fake/src/Button.tsx"): ts.SourceFile {
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

describe("parseClassExpressions", () => {
  it("parses cx() calls when the bind initializer is wrapped in transparent expressions", () => {
    const sourceFile = parse(`
      import classNames from 'classnames/bind';
      import styles from './Button.module.scss';
      const cx = (classNames as typeof classNames).bind((styles));
      const el = cx('button');
    `);
    const binder = buildSourceBinder(sourceFile);
    const { stylesBindings, bindings } = scanCxImports(
      sourceFile,
      "/fake/src/Button.tsx",
      () => true,
      EMPTY_ALIAS_RESOLVER,
    );
    const expressions = parseClassExpressions(
      sourceFile,
      resolveCxBindings(bindings, binder, sourceFile),
      stylesBindings,
      binder,
    );

    expect(expressions).toHaveLength(1);
    expect(expressions[0]).toMatchObject({
      kind: "literal",
      className: "button",
      scssModulePath: "/fake/src/Button.module.scss",
    });
  });

  it("unwraps transparent expressions around symbol arguments", () => {
    const sourceFile = parse(`
      import classNames from 'classnames/bind';
      import styles from './Button.module.scss';
      const cx = classNames.bind(styles);
      const size = 'lg' as const;
      const el = cx((size as string));
    `);
    const binder = buildSourceBinder(sourceFile);
    const { stylesBindings, bindings } = scanCxImports(
      sourceFile,
      "/fake/src/Button.tsx",
      () => true,
      EMPTY_ALIAS_RESOLVER,
    );
    const expressions = parseClassExpressions(
      sourceFile,
      resolveCxBindings(bindings, binder, sourceFile),
      stylesBindings,
      binder,
    );

    expect(expressions).toHaveLength(1);
    expect(expressions[0]).toMatchObject({
      kind: "symbolRef",
      rawReference: "size",
      rootName: "size",
      pathSegments: [],
    });
  });
});
