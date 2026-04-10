import { describe, it, expect } from "vitest";
import ts from "typescript";
import type { CxBinding, CxCallInfo } from "@css-module-explainer/shared";
import { parseCxCalls } from "../../../server/src/core/cx/call-parser";

function parse(source: string, filePath = "/fake/src/Button.tsx"): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    ts.ScriptKind.TSX,
  );
}

function makeBinding(overrides: Partial<CxBinding> = {}): CxBinding {
  return {
    cxVarName: "cx",
    stylesVarName: "styles",
    scssModulePath: "/fake/src/Button.module.scss",
    classNamesImportName: "classNames",
    scope: { startLine: 0, endLine: 9999 },
    ...overrides,
  };
}

function run(source: string, binding = makeBinding()): CxCallInfo[] {
  return parseCxCalls(parse(source), binding);
}

describe("parseCxCalls / string literal", () => {
  it("extracts a single string argument", () => {
    const calls = run(`const x = cx('indicator');`);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ kind: "static", className: "indicator" });
  });

  it("extracts every string in a multi-argument call", () => {
    const calls = run(`const x = cx('a', 'b', 'c');`);
    const names = calls.map((c) => (c as { className: string }).className);
    expect(names).toEqual(["a", "b", "c"]);
  });

  it("treats double quotes identically", () => {
    const calls = run(`const x = cx("btn");`);
    expect(calls[0]).toMatchObject({ kind: "static", className: "btn" });
  });

  it("excludes the quotes from originRange", () => {
    const src = `const x = cx('indicator');`;
    const calls = run(src);
    const info = calls[0]!;
    // 'indicator' starts at column 14 (after "const x = cx('"), length 9.
    expect(info.originRange.start.character).toBe(14);
    expect(info.originRange.end.character).toBe(14 + "indicator".length);
  });
});

describe("parseCxCalls / object literal keys", () => {
  it("extracts identifier keys", () => {
    const calls = run(`const x = cx({ active: isActive });`);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ kind: "static", className: "active" });
  });

  it("extracts string-literal keys", () => {
    const calls = run(`const x = cx({ 'is-active': isActive });`);
    expect(calls[0]).toMatchObject({ kind: "static", className: "is-active" });
  });

  it("extracts every key in the same object", () => {
    const calls = run(`const x = cx({ active: a, disabled: b });`);
    const names = calls.map((c) => (c as { className: string }).className);
    expect(names).toEqual(["active", "disabled"]);
  });

  it("mixes object keys with sibling string arguments", () => {
    const calls = run(`const x = cx('btn', { active: a });`);
    const names = calls.map((c) => (c as { className: string }).className);
    expect(names).toEqual(["btn", "active"]);
  });

  it("skips computed-property keys", () => {
    const calls = run(`const x = cx({ [dynamicKey]: true });`);
    expect(calls).toHaveLength(0);
  });
});

describe("parseCxCalls / conditional expressions", () => {
  it("extracts from `cond && 'cls'`", () => {
    const calls = run(`const x = cx(isActive && 'active');`);
    expect(calls[0]).toMatchObject({ kind: "static", className: "active" });
  });

  it("extracts both branches of a ternary", () => {
    const calls = run(`const x = cx(isActive ? 'on' : 'off');`);
    const names = calls.map((c) => (c as { className: string }).className);
    expect(names).toEqual(["on", "off"]);
  });

  it("handles nested conditionals", () => {
    const calls = run(`const x = cx(big ? 'lg' : small ? 'sm' : 'md');`);
    const names = calls.map((c) => (c as { className: string }).className).toSorted();
    expect(names).toEqual(["lg", "md", "sm"]);
  });
});

describe("parseCxCalls / template literal", () => {
  it("extracts a template literal with a static prefix", () => {
    const calls = run(`const x = cx(\`weight-\${weight}\`);`);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      kind: "template",
      staticPrefix: "weight-",
    });
  });

  it("handles template with empty static prefix", () => {
    const calls = run(`const x = cx(\`\${name}-suffix\`);`);
    expect(calls[0]).toMatchObject({ kind: "template", staticPrefix: "" });
  });

  it("treats no-substitution template as a static string", () => {
    const calls = run(`const x = cx(\`plain\`);`);
    expect(calls[0]).toMatchObject({ kind: "static", className: "plain" });
  });
});

describe("parseCxCalls / identifier reference (variable)", () => {
  it("records the variable name for bare identifier args", () => {
    const calls = run(`const x = cx(size);`);
    expect(calls[0]).toMatchObject({ kind: "variable", variableName: "size" });
  });
});

describe("parseCxCalls / array literal", () => {
  it("walks array elements", () => {
    const calls = run(`const x = cx(['a', 'b']);`);
    const names = calls.map((c) => (c as { className: string }).className);
    expect(names).toEqual(["a", "b"]);
  });

  it("mixes string and conditional inside an array", () => {
    const calls = run(`const x = cx(['base', isActive && 'on']);`);
    const names = calls.map((c) => (c as { className: string }).className);
    expect(names).toEqual(["base", "on"]);
  });
});

describe("parseCxCalls / spread element", () => {
  it("walks array literals passed as spread", () => {
    const calls = run(`const x = cx(...['a', 'b']);`);
    const names = calls.map((c) => (c as { className: string }).className);
    expect(names).toEqual(["a", "b"]);
  });

  it("skips non-literal spreads", () => {
    const calls = run(`const x = cx(...names);`);
    expect(calls).toHaveLength(0);
  });
});

describe("parseCxCalls / multi-line call", () => {
  it("handles a cx call spanning multiple lines", () => {
    const src = `
      const x = cx(
        'base',
        { active: isActive },
        isDisabled && 'disabled',
        size && \`size-\${size}\`,
      );
    `;
    const calls = run(src);
    const staticNames = calls
      .filter((c) => c.kind === "static")
      .map((c) => (c as { className: string }).className)
      .toSorted();
    expect(staticNames).toEqual(["active", "base", "disabled"].toSorted());
    expect(calls.some((c) => c.kind === "template")).toBe(true);
  });
});

describe("parseCxCalls / binding scope", () => {
  it("ignores calls outside the binding scope", () => {
    const src = `
      function A() {
        const cx = classNames.bind(styles);
        return cx('inside');
      }
      function B() {
        return cx('outside');
      }
    `;
    // Binding scope restricted to function A's body lines (roughly 2–4).
    const calls = run(src, makeBinding({ scope: { startLine: 1, endLine: 4 } }));
    const names = calls.map((c) => (c as { className: string }).className);
    expect(names).toContain("inside");
    expect(names).not.toContain("outside");
  });
});

describe("parseCxCalls / negative cases", () => {
  it("returns [] for a file without cx calls", () => {
    expect(run(`const x = 1 + 2;`)).toEqual([]);
  });

  it("ignores calls to a differently-named function", () => {
    const calls = run(`const x = cn('ignored');`, makeBinding({ cxVarName: "cx" }));
    expect(calls).toEqual([]);
  });
});

describe("parseCxCalls / zero-arg and empty-collection edges", () => {
  it("handles `cx()` with no arguments", () => {
    // `cx()` is a legal no-op; the parser must not crash and must
    // return an empty array so diagnostics/hover silently do nothing.
    const calls = run(`const x = cx();`);
    expect(calls).toEqual([]);
  });

  it("handles `cx({})` with an empty object", () => {
    const calls = run(`const x = cx({});`);
    expect(calls).toEqual([]);
  });

  it("handles `cx([])` with an empty array", () => {
    const calls = run(`const x = cx([]);`);
    expect(calls).toEqual([]);
  });

  it("extracts a shorthand object property `{ active }`", () => {
    // Shorthand is ES2015 `{ active: active }`. The detector handles
    // this via isShorthandPropertyAssignment; test pins the support.
    const calls = run(`const x = cx({ active });`);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ kind: "static", className: "active" });
  });

  it("extracts multiple shorthand keys together", () => {
    const calls = run(`const x = cx({ active, disabled });`);
    const names = calls.map((c) => (c as { className: string }).className);
    expect(names).toEqual(["active", "disabled"]);
  });
});

describe("parseCxCalls / property access", () => {
  it("captures `cx(props.variant)` as a variable call with the full expression text", () => {
    const calls = run(`const x = cx(props.variant);`);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.kind).toBe("variable");
    if (calls[0]!.kind === "variable") {
      expect(calls[0]!.variableName).toBe("props.variant");
    }
  });
});
