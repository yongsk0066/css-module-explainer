import { afterEach, describe, expect, it } from "vitest";
import { CodeActionKind, DiagnosticSeverity } from "vscode-languageserver-protocol/node";
import { createInProcessServer, type LspTestClient } from "./_harness/in-process-server";
import { FakeTypeResolver } from "../_fixtures/fake-type-resolver";

const BUTTON_TSX = `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function Button() {
  return <div className={cx('indicaror')}>hi</div>;
}
`;

const BUTTON_SCSS = `
.indicator { color: red; }
`;

describe("code-action protocol", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
  });

  it("advertises codeActionProvider with quickfix kind", async () => {
    client = createInProcessServer();
    const result = await client.initialize();
    expect(result.capabilities.codeActionProvider).toEqual({
      codeActionKinds: ["quickfix"],
      resolveProvider: false,
    });
  });

  it("returns replace and create actions for a missing-selector diagnostic", async () => {
    client = createInProcessServer({
      readStyleFile: () => BUTTON_SCSS,
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: "file:///fake/workspace/src/Button.tsx",
        languageId: "typescriptreact",
        version: 1,
        text: BUTTON_TSX,
      },
    });
    // Wait for diagnostics → the typo 'indicaror' should produce
    // one Warning with `data.suggestion: "indicator"`.
    const diagnostics = await client.waitForDiagnostics("file:///fake/workspace/src/Button.tsx");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.data).toMatchObject({
      suggestion: "indicator",
      createSelector: {
        uri: "file:///fake/workspace/src/Button.module.scss",
      },
    });

    // Now ask for code actions at the diagnostic range.
    const actions = await client.codeAction({
      textDocument: { uri: "file:///fake/workspace/src/Button.tsx" },
      range: diagnostics[0]!.range,
      context: {
        diagnostics,
        triggerKind: 1,
      },
    });
    expect(actions).not.toBeNull();
    expect(actions).toHaveLength(2);
    const action = actions![0] as {
      title: string;
      kind: string;
      edit?: { changes?: Record<string, Array<{ newText: string }>> };
    };
    expect(action.title).toBe("Replace with 'indicator'");
    expect(action.kind).toBe(CodeActionKind.QuickFix);
    const edits = action.edit?.changes?.["file:///fake/workspace/src/Button.tsx"];
    expect(edits).toHaveLength(1);
    expect(edits![0]!.newText).toBe("indicator");

    const createAction = actions![1] as {
      title: string;
      edit?: { changes?: Record<string, Array<{ newText: string }>> };
    };
    expect(createAction.title).toBe("Add '.indicaror' to Button.module.scss");
    const styleEdits =
      createAction.edit?.changes?.["file:///fake/workspace/src/Button.module.scss"];
    expect(styleEdits).toHaveLength(1);
    expect(styleEdits![0]!.newText).toBe("\n\n.indicaror {\n}\n");
  });

  it("returns null when the context contains only suggestion-less diagnostics", async () => {
    client = createInProcessServer();
    await client.initialize();
    const actions = await client.codeAction({
      textDocument: { uri: "file:///never/opened.tsx" },
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      context: {
        diagnostics: [
          {
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
            severity: DiagnosticSeverity.Warning,
            source: "css-module-explainer",
            message: "whatever",
          },
        ],
        triggerKind: 1,
      },
    });
    expect(actions).toBeNull();
  });
});
