import { describe, expect, it } from "vitest";
import { scenario, workspace } from "../../../packages/vitest-cme/src";

describe("vitest-cme scenario wrapper", () => {
  const ws = workspace({
    "Button.tsx": "const cls = cx(/*|*/styles.root, /*at:rename*/styles.active);",
  });

  it("runs the hover action at a marker", async () => {
    const spec = scenario({
      name: "button hover",
      workspace: ws,
      actions: {
        hover: ({ target }) => ({ kind: "hover", position: target.position }),
      },
    });

    await expect(spec.hover()).resolves.toEqual({
      kind: "hover",
      position: { line: 0, character: 15 },
    });
  });

  it("runs the definition action at a named marker", async () => {
    const spec = scenario({
      workspace: ws,
      actions: {
        definition: ({ target }) => ({ resolved: target.name }),
      },
    });

    await expect(spec.definition("rename")).resolves.toEqual({ resolved: "rename" });
  });

  it("runs the prepareRename action at a named marker", async () => {
    const spec = scenario({
      workspace: ws,
      actions: {
        prepareRename: ({ target }) => ({
          range: {
            start: target.position,
            end: { line: target.position.line, character: target.position.character + 6 },
          },
        }),
      },
    });

    await expect(spec.prepareRename("rename")).resolves.toEqual({
      range: {
        start: { line: 0, character: 28 },
        end: { line: 0, character: 34 },
      },
    });
  });

  it("runs the codeAction action at the default marker", async () => {
    const spec = scenario({
      workspace: ws,
      actions: {
        codeAction: ({ target }) => ({ request: "codeAction", filePath: target.filePath }),
      },
    });

    await expect(spec.codeAction()).resolves.toEqual({
      request: "codeAction",
      filePath: "Button.tsx",
    });
  });

  it("runs the completion action at the default marker", async () => {
    const spec = scenario({
      workspace: ws,
      actions: {
        completion: ({ target }) => ({ request: "completion", position: target.position }),
      },
    });

    await expect(spec.completion()).resolves.toEqual({
      request: "completion",
      position: { line: 0, character: 15 },
    });
  });

  it("fails clearly when an action is missing", async () => {
    const spec = scenario({
      name: "missing action",
      workspace: ws,
      actions: {},
    });

    await expect(spec.hover()).rejects.toThrow(/does not define action "hover"/);
  });
});
