import ts from "typescript";
import { describe, expect, it } from "vitest";
import { resolveFlowClassValues } from "../../../server/engine-core-ts/src/core/flow/class-value-analysis";

describe("resolveFlowClassValues", () => {
  it("tracks straight-line reassignment before the class use", () => {
    const source = `
function render() {
  let size = "sm";
  size = "lg";
  return cx(size);
}
`;
    const sourceFile = ts.createSourceFile(
      "/fake/Flow.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    expect(resolveFlowClassValues(sourceFile, rangeOf(source, "cx(size)"), "size")).toEqual({
      abstractValue: {
        kind: "exact",
        value: "lg",
      },
      valueCertainty: "exact",
      reason: "flowLiteral",
    });
  });

  it("merges branch-local assignments into an inferred union", () => {
    const source = `
function render(flag: boolean) {
  let size = "sm";
  if (flag) {
    size = "lg";
  }
  return cx(size);
}
`;
    const sourceFile = ts.createSourceFile(
      "/fake/Flow.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    expect(resolveFlowClassValues(sourceFile, rangeOf(source, "cx(size)"), "size")).toEqual({
      abstractValue: {
        kind: "finiteSet",
        values: ["lg", "sm"],
      },
      valueCertainty: "inferred",
      reason: "flowBranch",
    });
  });

  it("prunes branches that return before the class use", () => {
    const source = `
function render(flag: boolean) {
  let size = "sm";
  if (flag) {
    size = "lg";
    return null;
  }
  return cx(size);
}
`;
    const sourceFile = ts.createSourceFile(
      "/fake/Flow.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    expect(resolveFlowClassValues(sourceFile, rangeOf(source, "cx(size)"), "size")).toEqual({
      abstractValue: {
        kind: "exact",
        value: "sm",
      },
      valueCertainty: "exact",
      reason: "flowLiteral",
    });
  });

  it("derives a prefix domain from concatenation with an unknown suffix", () => {
    const source = `
function render(variant: string) {
  const size = "btn-" + variant;
  return cx(size);
}
`;
    const sourceFile = ts.createSourceFile(
      "/fake/Flow.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    expect(resolveFlowClassValues(sourceFile, rangeOf(source, "cx(size)"), "size")).toEqual({
      abstractValue: {
        kind: "prefix",
        prefix: "btn-",
        provenance: "concatUnknownRight",
      },
      valueCertainty: "inferred",
      reason: "flowLiteral",
    });
  });

  it("derives a suffix domain from concatenation with an unknown prefix", () => {
    const source = `
function render(variant: string) {
  const size = variant + "-chip";
  return cx(size);
}
`;
    const sourceFile = ts.createSourceFile(
      "/fake/Flow.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    expect(resolveFlowClassValues(sourceFile, rangeOf(source, "cx(size)"), "size")).toEqual({
      abstractValue: {
        kind: "suffix",
        suffix: "-chip",
        provenance: "concatUnknownLeft",
      },
      valueCertainty: "inferred",
      reason: "flowLiteral",
    });
  });

  it("derives a prefix-suffix domain from known prefix plus unknown middle plus known suffix", () => {
    const source = `
function render(variant: string) {
  const size = "btn-" + variant + "-chip";
  return cx(size);
}
`;
    const sourceFile = ts.createSourceFile(
      "/fake/Flow.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    expect(resolveFlowClassValues(sourceFile, rangeOf(source, "cx(size)"), "size")).toEqual({
      abstractValue: {
        kind: "prefixSuffix",
        prefix: "btn-",
        suffix: "-chip",
        minLength: 9,
        provenance: "concatKnownEdges",
      },
      valueCertainty: "inferred",
      reason: "flowLiteral",
    });
  });

  it("widens conflicting concatenation prefixes to top", () => {
    const source = `
function render(flag: boolean, variant: string) {
  const prefix = flag ? "btn-" : "card-";
  const size = prefix + variant;
  return cx(size);
}
`;
    const sourceFile = ts.createSourceFile(
      "/fake/Flow.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    expect(resolveFlowClassValues(sourceFile, rangeOf(source, "cx(size)"), "size")).toEqual({
      abstractValue: {
        kind: "top",
      },
      valueCertainty: "possible",
      reason: "flowBranch",
    });
  });

  it("derives a finite set from a same-file helper call that returns string literals", () => {
    const source = `
type Status = "idle" | "busy" | "error";

function resolveStatusClass(status: Status): string {
  switch (status) {
    case "idle":
      return "state-idle";
    case "busy":
      return "state-busy";
    case "error":
      return "state-error";
    default:
      return "state-idle";
  }
}

function render(status: Status) {
  const derivedStatusClass = resolveStatusClass(status);
  return cx(derivedStatusClass);
}
`;
    const sourceFile = ts.createSourceFile(
      "/fake/Flow.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    expect(
      resolveFlowClassValues(
        sourceFile,
        rangeOf(source, "cx(derivedStatusClass)"),
        "derivedStatusClass",
      ),
    ).toEqual({
      abstractValue: {
        kind: "finiteSet",
        values: ["state-busy", "state-error", "state-idle"],
      },
      valueCertainty: "inferred",
      reason: "flowBranch",
    });
  });
});

function rangeOf(source: string, token: string) {
  const tokenIndex = source.lastIndexOf(token);
  const startIndex = tokenIndex + token.indexOf("size");
  const prefix = source.slice(0, startIndex);
  const line = prefix.split("\n").length - 1;
  const lastLineStart = prefix.lastIndexOf("\n");
  const character = startIndex - (lastLineStart + 1);
  return {
    start: { line, character },
    end: { line, character: character + 4 },
  };
}
