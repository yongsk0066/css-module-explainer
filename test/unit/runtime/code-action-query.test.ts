import { describe, expect, it } from "vitest";
import {
  planCodeActions,
  type CodeActionDiagnosticInput,
} from "../../../server/engine-host-node/src/code-action-query";

function diagnostic(suggestion: string | undefined, message = "foo"): CodeActionDiagnosticInput {
  const className = /Class '\.([^']+)'/.exec(message)?.[1] ?? "generated";
  return {
    range: {
      start: { line: 4, character: 15 },
      end: { line: 4, character: 24 },
    },
    message,
    data:
      suggestion === undefined
        ? undefined
        : {
            suggestion,
            createSelector: {
              uri: "file:///fake/src/Button.module.scss",
              range: {
                start: { line: 1, character: 0 },
                end: { line: 1, character: 0 },
              },
              newText: `\n\n.${className} {\n}\n`,
            },
          },
  };
}

describe("planCodeActions", () => {
  it("plans replacement and create-selector quick fixes from diagnostic data", () => {
    const result = planCodeActions(
      {
        documentUri: "file:///fake/src/Button.tsx",
        diagnostics: [
          diagnostic("indicator", "Class '.indicaror' not found. Did you mean 'indicator'?"),
        ],
      },
      { fileExists: () => true },
    );

    expect(result).toEqual([
      {
        kind: "textEdit",
        title: "Replace with 'indicator'",
        diagnosticIndex: 0,
        uri: "file:///fake/src/Button.tsx",
        range: {
          start: { line: 4, character: 15 },
          end: { line: 4, character: 24 },
        },
        newText: "indicator",
        isPreferred: true,
      },
      {
        kind: "textEdit",
        title: "Add '.indicaror' to Button.module.scss",
        diagnosticIndex: 0,
        uri: "file:///fake/src/Button.module.scss",
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 0 },
        },
        newText: "\n\n.indicaror {\n}\n",
      },
    ]);
  });

  it("plans create-file actions from missing module diagnostics", () => {
    const result = planCodeActions(
      {
        documentUri: "file:///fake/src/Button.tsx",
        diagnostics: [
          {
            range: {
              start: { line: 0, character: 19 },
              end: { line: 0, character: 38 },
            },
            message: "Cannot resolve CSS Module './Button.module.scss'. The file does not exist.",
            data: {
              createModuleFile: {
                uri: "file:///fake/src/Button.module.scss",
              },
            },
          },
        ],
      },
      { fileExists: () => false },
    );

    expect(result).toEqual([
      {
        kind: "createFile",
        title: "Create Button.module.scss",
        diagnosticIndex: 0,
        uri: "file:///fake/src/Button.module.scss",
        isPreferred: true,
      },
    ]);
  });

  it("plans proactive sibling module actions for unstyled source files", () => {
    const result = planCodeActions(
      {
        documentUri: "file:///fake/src/Button.tsx",
        diagnostics: [],
      },
      { fileExists: () => false },
    );

    expect(result.map((plan) => plan.title)).toEqual([
      "Create Button.module.scss",
      "Create Button.module.css",
      "Create Button.module.less",
    ]);
  });
});
