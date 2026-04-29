import { afterEach, describe, expect, it } from "vitest";
import {
  createInProcessServer,
  emptySupplier,
  type LspTestClient,
} from "./_harness/in-process-server";
import { FakeTypeResolver } from "../_fixtures/fake-type-resolver";
import {
  textDocumentPositionParams,
  workspace,
  type CmeWorkspace,
} from "../../packages/vitest-cme/src";

const BUTTON_SCSS_URI = "file:///fake/workspace/src/Button.module.scss";

const UTILS_SCSS = `@forward "@design/tokens" as ds_*;`;

const PACKAGE_JSON = `{"sass":"src/index.scss"}`;

const TOKENS_INDEX_SCSS = `@forward "./colors";
@forward "./typography";
`;

const TOKENS_COLORS_SCSS = `$gray700: #767678;`;

const TOKENS_TYPOGRAPHY_SCSS = `@mixin typography16 {}`;

const TOKENS_VARIABLES_CSS = `:root { --color-gray-700: #767678; }`;

const REFERENCE_WORKSPACE = workspace({
  [BUTTON_SCSS_URI]: `@use "@design/tokens/variables.css";
@use "./utils" as *;

.title {
  color: var(--color-gray-/*at:customProperty*/700);
  border-color: $ds_g/*at:variable*/ray700;
  @include ds_t/*at:mixin*/ypography16;
}
`,
});

const REFERENCE_SCSS = REFERENCE_WORKSPACE.file(BUTTON_SCSS_URI).content;

const COMPLETION_WORKSPACE = workspace({
  [BUTTON_SCSS_URI]: `@use "@design/tokens/variables.css";
@use "./utils" as *;

.title {
  color: var(--/*at:customProperty*/);
  border-color: $ds_/*at:variable*/;
  @include ds_typo/*at:mixin*/;
}
`,
});

const COMPLETION_SCSS = COMPLETION_WORKSPACE.file(BUTTON_SCSS_URI).content;

function styleFileReader(buttonScss: string): (filePath: string) => string | null {
  return (filePath) => {
    const normalized = filePath.replaceAll("\\", "/");
    if (normalized.includes("/src/node_modules/@design/tokens/")) return null;
    if (normalized.endsWith("/src/Button.module.scss")) return buttonScss;
    if (normalized.endsWith("/src/_utils.scss")) return UTILS_SCSS;
    if (normalized.endsWith("/node_modules/@design/tokens/package.json")) return PACKAGE_JSON;
    if (normalized.endsWith("/node_modules/@design/tokens/src/index.scss")) {
      return TOKENS_INDEX_SCSS;
    }
    if (normalized.endsWith("/node_modules/@design/tokens/src/_colors.scss")) {
      return TOKENS_COLORS_SCSS;
    }
    if (normalized.endsWith("/node_modules/@design/tokens/src/_typography.scss")) {
      return TOKENS_TYPOGRAPHY_SCSS;
    }
    if (normalized.endsWith("/node_modules/@design/tokens/variables.css")) {
      return TOKENS_VARIABLES_CSS;
    }
    return null;
  };
}

function positionParams(
  source: CmeWorkspace,
  markerName: string,
): {
  readonly textDocument: { readonly uri: string };
  readonly position: { readonly line: number; readonly character: number };
} {
  return textDocumentPositionParams({
    workspace: source,
    documentUri: BUTTON_SCSS_URI,
    filePath: BUTTON_SCSS_URI,
    markerName,
  });
}

function openStyleDocument(client: LspTestClient, content: string): void {
  client.didOpen({
    textDocument: {
      uri: BUTTON_SCSS_URI,
      languageId: "scss",
      version: 1,
      text: content,
    },
  });
}

function normalizePathSeparators(text: string): string {
  return text.replaceAll("\\", "/");
}

describe("design-token package protocol integration", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
  });

  it("resolves package CSS variables and forwarded Sass tokens through LSP hover and definition", async () => {
    client = createInProcessServer({
      readStyleFile: styleFileReader(REFERENCE_SCSS),
      typeResolver: new FakeTypeResolver(),
      fileSupplier: emptySupplier,
    });
    await client.initialize();
    client.initialized();
    openStyleDocument(client, REFERENCE_SCSS);

    const customHover = await client.hover(positionParams(REFERENCE_WORKSPACE, "customProperty"));
    expect((customHover!.contents as { value: string }).value).toContain("--color-gray-700");
    expect((customHover!.contents as { value: string }).value).toContain("variables.css");

    const variableHover = await client.hover(positionParams(REFERENCE_WORKSPACE, "variable"));
    const variableHoverText = normalizePathSeparators(
      (variableHover!.contents as { value: string }).value,
    );
    expect(variableHoverText).toContain("`$ds_gray700`");
    expect(variableHoverText).toContain("node_modules/@design/tokens/src/_colors.scss");

    const mixinHover = await client.hover(positionParams(REFERENCE_WORKSPACE, "mixin"));
    const mixinHoverText = normalizePathSeparators(
      (mixinHover!.contents as { value: string }).value,
    );
    expect(mixinHoverText).toContain("`@mixin ds_typography16`");
    expect(mixinHoverText).toContain("node_modules/@design/tokens/src/_typography.scss");

    const variableDefinition = await client.definition(
      positionParams(REFERENCE_WORKSPACE, "variable"),
    );
    expect(variableDefinition).toEqual([
      expect.objectContaining({
        targetUri: "file:///fake/workspace/node_modules/@design/tokens/src/_colors.scss",
      }),
    ]);

    const mixinDefinition = await client.definition(positionParams(REFERENCE_WORKSPACE, "mixin"));
    expect(mixinDefinition).toEqual([
      expect.objectContaining({
        targetUri: "file:///fake/workspace/node_modules/@design/tokens/src/_typography.scss",
      }),
    ]);
  });

  it("completes package CSS variables and forwarded Sass tokens through LSP completion", async () => {
    client = createInProcessServer({
      readStyleFile: styleFileReader(COMPLETION_SCSS),
      typeResolver: new FakeTypeResolver(),
      fileSupplier: emptySupplier,
    });
    await client.initialize();
    client.initialized();
    openStyleDocument(client, COMPLETION_SCSS);

    const customPropertyResult = await client.completion(
      positionParams(COMPLETION_WORKSPACE, "customProperty"),
    );
    const customPropertyItems = Array.isArray(customPropertyResult)
      ? customPropertyResult
      : customPropertyResult!.items;
    expect(customPropertyItems.map((item) => item.label)).toEqual(["--color-gray-700"]);

    const variableResult = await client.completion(
      positionParams(COMPLETION_WORKSPACE, "variable"),
    );
    const variableItems = Array.isArray(variableResult) ? variableResult : variableResult!.items;
    expect(variableItems.map((item) => item.label)).toEqual(["$ds_gray700"]);

    const mixinResult = await client.completion(positionParams(COMPLETION_WORKSPACE, "mixin"));
    const mixinItems = Array.isArray(mixinResult) ? mixinResult : mixinResult!.items;
    expect(mixinItems.map((item) => item.label)).toEqual(["ds_typography16"]);
  });

  it("does not warn on the resolved package token path through LSP diagnostics", async () => {
    client = createInProcessServer({
      readStyleFile: styleFileReader(REFERENCE_SCSS),
      typeResolver: new FakeTypeResolver(),
      fileSupplier: emptySupplier,
    });
    await client.initialize();
    client.initialized();
    openStyleDocument(client, REFERENCE_SCSS);

    const diagnostics = await client.waitForDiagnostics(BUTTON_SCSS_URI);
    expect(
      diagnostics.filter(
        (diagnostic) =>
          diagnostic.message.includes("CSS custom property") ||
          diagnostic.message.includes("Sass variable") ||
          diagnostic.message.includes("Sass mixin"),
      ),
    ).toEqual([]);
  });
});
