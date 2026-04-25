import { describe, expect, it } from "vitest";
import {
  MarkerParseError,
  cursorFixture,
  documentFixture,
  targetFixture,
  textDocumentPositionFixture,
  textDocumentPositionFromCursor,
  textDocumentRangeFixture,
  textDocumentRenameFromCursor,
  textDocumentRenameFixture,
  workspace,
} from "../../../packages/vitest-cme/src";

describe("vitest-cme workspace markers", () => {
  it("strips cursor markers and records zero-based positions", () => {
    const ws = workspace({
      "Button.tsx": "const cls = cx(\n  /*|*/styles.root\n);",
    });

    expect(ws.file("Button.tsx").content).toBe("const cls = cx(\n  styles.root\n);");
    expect(ws.marker().position).toEqual({ line: 1, character: 2 });
  });

  it("records named point markers", () => {
    const ws = workspace({
      "Button.tsx": "const target = /*at:rename*/styles.root;",
    });

    expect(ws.marker("rename").position).toEqual({ line: 0, character: 15 });
  });

  it("records named ranges", () => {
    const ws = workspace({
      "Button.tsx": "const target = /*<class>*/styles.root/*</class>*/;",
    });

    expect(ws.range("class").range).toEqual({
      start: { line: 0, character: 15 },
      end: { line: 0, character: 26 },
    });
  });

  it("rejects duplicate marker names", () => {
    expect(() =>
      workspace({
        "Button.tsx": "/*at:target*/a;/*at:target*/b;",
      }),
    ).toThrow(/Duplicate marker "target"/);
  });

  it("reports missing marker references clearly", () => {
    const ws = workspace({
      "Button.tsx": "const target = /*|*/styles.root;",
    });

    expect(() => ws.marker("rename")).toThrow(/Missing marker "rename"/);
  });

  it("rejects malformed range markers", () => {
    expect(() =>
      workspace({
        "Button.tsx": "const target = /*<range*/styles.root;",
      }),
    ).toThrow(MarkerParseError);
  });

  it("supports escaped cursor marker syntax", () => {
    const ws = workspace({
      "Button.tsx": String.raw`const literal = "/*\|*/";`,
    });

    expect(ws.file("Button.tsx").content).toBe('const literal = "/*|*/";');
    expect(() => ws.marker()).toThrow(/Missing marker "cursor"/);
  });

  it("builds provider cursor params from a marker", () => {
    const ws = workspace({
      "Button.tsx": "const cls = cx(/*at:hover*/styles.root);",
    });

    expect(
      cursorFixture({
        workspace: ws,
        filePath: "Button.tsx",
        documentUri: "file:///fake/Button.tsx",
        markerName: "hover",
        version: 3,
      }),
    ).toEqual({
      documentUri: "file:///fake/Button.tsx",
      content: "const cls = cx(styles.root);",
      filePath: "Button.tsx",
      line: 0,
      character: 15,
      position: { line: 0, character: 15 },
      marker: {
        name: "hover",
        filePath: "Button.tsx",
        position: { line: 0, character: 15 },
      },
      version: 3,
    });
  });

  it("builds provider document params from a workspace file", () => {
    const ws = workspace({
      "Button.tsx": "const cls = cx('indicator');",
    });

    expect(
      documentFixture({
        workspace: ws,
        filePath: "Button.tsx",
        documentUri: "file:///fake/Button.tsx",
        version: 4,
      }),
    ).toMatchObject({
      documentUri: "file:///fake/Button.tsx",
      content: "const cls = cx('indicator');",
      filePath: "Button.tsx",
      version: 4,
    });
  });

  it("builds runtime query targets from a marker", () => {
    const ws = workspace({
      "Button.module.scss": ".button { color: /*at:value*/$gap; }",
    });

    expect(
      targetFixture({
        workspace: ws,
        markerName: "value",
      }),
    ).toEqual({
      filePath: "Button.module.scss",
      line: 0,
      character: 17,
      position: { line: 0, character: 17 },
      marker: {
        name: "value",
        filePath: "Button.module.scss",
        position: { line: 0, character: 17 },
      },
    });
  });

  it("builds LSP text document position params from a marker", () => {
    const ws = workspace({
      "Button.module.scss": ".button { color: /*at:value*/$gap; }",
    });

    expect(
      textDocumentPositionFixture({
        workspace: ws,
        filePath: "Button.module.scss",
        documentUri: "file:///fake/Button.module.scss",
        markerName: "value",
      }),
    ).toMatchObject({
      textDocument: { uri: "file:///fake/Button.module.scss" },
      position: { line: 0, character: 17 },
      target: {
        filePath: "Button.module.scss",
        marker: { name: "value" },
      },
    });
  });

  it("builds LSP text document position params from cursor params", () => {
    const ws = workspace({
      "Button.tsx": "const cls = cx(/*at:hover*/styles.root);",
    });
    const cursor = cursorFixture({
      workspace: ws,
      filePath: "Button.tsx",
      documentUri: "file:///fake/Button.tsx",
      markerName: "hover",
    });

    expect(textDocumentPositionFromCursor(cursor)).toEqual({
      textDocument: { uri: "file:///fake/Button.tsx" },
      position: { line: 0, character: 15 },
    });
  });

  it("builds LSP rename params from a marker", () => {
    const ws = workspace({
      "Button.module.scss": ".button { color: /*at:value*/$gap; }",
    });

    expect(
      textDocumentRenameFixture({
        workspace: ws,
        filePath: "Button.module.scss",
        documentUri: "file:///fake/Button.module.scss",
        markerName: "value",
        newName: "spacing",
      }),
    ).toMatchObject({
      textDocument: { uri: "file:///fake/Button.module.scss" },
      position: { line: 0, character: 17 },
      newName: "spacing",
    });
  });

  it("builds LSP rename params from cursor params", () => {
    const ws = workspace({
      "Button.tsx": "const cls = cx(/*at:hover*/styles.root);",
    });
    const cursor = cursorFixture({
      workspace: ws,
      filePath: "Button.tsx",
      documentUri: "file:///fake/Button.tsx",
      markerName: "hover",
    });

    expect(textDocumentRenameFromCursor(cursor, "active")).toEqual({
      textDocument: { uri: "file:///fake/Button.tsx" },
      position: { line: 0, character: 15 },
      newName: "active",
    });
  });

  it("builds LSP text document range params from a range marker", () => {
    const ws = workspace({
      "Button.tsx": "const cls = cx('/*<missing>*/missing/*</missing>*/');",
    });

    expect(
      textDocumentRangeFixture({
        workspace: ws,
        filePath: "Button.tsx",
        documentUri: "file:///fake/Button.tsx",
        rangeName: "missing",
      }),
    ).toMatchObject({
      textDocument: { uri: "file:///fake/Button.tsx" },
      range: {
        start: { line: 0, character: 16 },
        end: { line: 0, character: 23 },
      },
      marker: {
        name: "missing",
        filePath: "Button.tsx",
      },
    });
  });
});
