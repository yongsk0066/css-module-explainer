import { afterEach, describe, expect, it } from "vitest";
import { createInProcessServer, type LspTestClient } from "./_harness/in-process-server";
import { FakeTypeResolver } from "../_fixtures/fake-type-resolver";
import { targetFixture, workspace, type CmeWorkspace } from "../../packages/vitest-cme/src";

const BUTTON_TSX_URI = "file:///fake/workspace/src/Button.tsx";
const BUTTON_SCSS_URI = "file:///fake/workspace/src/Button.module.scss";
const STATUS_TSX_URI = "file:///fake/workspace/src/Status.tsx";
const STATE_CHIP_TSX_URI = "file:///fake/workspace/src/StateChip.tsx";
const BUTTON_CHIP_TSX_URI = "file:///fake/workspace/src/ButtonChip.tsx";

const BUTTON_TSX_WORKSPACE = workspace({
  [BUTTON_TSX_URI]: `impor/*at:outside*/t classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function Button() {
  return <div className={cx('indic/*|*/ator')}>hi</div>;
}
`,
});

const BUTTON_TSX = BUTTON_TSX_WORKSPACE.file(BUTTON_TSX_URI).content;

const BUTTON_SCSS = `
.indicator {
  color: red;
}

.active {
  color: blue;
}
`;

const KEYFRAMES_WORKSPACE = workspace({
  [BUTTON_SCSS_URI]: `@keyframes fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.box {
  animation: fa/*|*/de 1s linear;
}

.pulse {
  animation-name: fade;
}
`,
});

const KEYFRAMES_SCSS = KEYFRAMES_WORKSPACE.file(BUTTON_SCSS_URI).content;

const VALUE_WORKSPACE = workspace({
  [BUTTON_SCSS_URI]: `@value primary: #ff3355;

.button {
  color: p/*|*/rimary;
}
`,
});

const VALUE_SCSS = VALUE_WORKSPACE.file(BUTTON_SCSS_URI).content;

const IMPORTED_VALUE_WORKSPACE = workspace({
  [BUTTON_SCSS_URI]: `@value primary from "./tokens.module.scss";

.button {
  color: p/*|*/rimary;
}
`,
});

const IMPORTED_VALUE_SCSS = IMPORTED_VALUE_WORKSPACE.file(BUTTON_SCSS_URI).content;

const TOKENS_SCSS = `@value primary: #ff3355;`;

const SASS_SYMBOL_WORKSPACE = workspace({
  [BUTTON_SCSS_URI]: `$gap: 1rem;
@mixin raised() {}
.button {
  color: $/*at:variable*/gap;
  @include ra/*at:mixin*/ised();
}
`,
});

const SASS_SYMBOL_SCSS = SASS_SYMBOL_WORKSPACE.file(BUTTON_SCSS_URI).content;

const FUNCTION_DYNAMIC_WORKSPACE = workspace({
  [STATUS_TSX_URI]: `import classNames from 'classnames/bind';
import styles from './Status.module.scss';
const cx = classNames.bind(styles);
type Status = 'idle' | 'busy' | 'error';
function resolveStatusClass(status: Status): string {
  switch (status) {
    case 'idle':
      return 'state-idle';
    case 'busy':
      return 'state-busy';
    case 'error':
      return 'state-error';
    default:
      return 'state-idle';
  }
}
export function StatusChip(status: Status) {
  const derivedStatusClass = resolveStatusClass(status);
  return <div className={cx('chip', deri/*|*/vedStatusClass)}>hi</div>;
}
`,
});

const FUNCTION_DYNAMIC_TSX = FUNCTION_DYNAMIC_WORKSPACE.file(STATUS_TSX_URI).content;

const FUNCTION_DYNAMIC_SCSS = `
.chip { color: slategray; }
.state-idle { color: teal; }
.state-busy { color: orange; }
.state-error { color: crimson; }
`;

const SUFFIX_DYNAMIC_WORKSPACE = workspace({
  [STATE_CHIP_TSX_URI]: `import classNames from 'classnames/bind';
import styles from './StateChip.module.scss';
const cx = classNames.bind(styles);
export function StateChip(variant: string) {
  const derivedChipClass = variant + '-chip';
  return <div className={cx('chip', derive/*|*/dChipClass)}>hi</div>;
}
`,
});

const SUFFIX_DYNAMIC_TSX = SUFFIX_DYNAMIC_WORKSPACE.file(STATE_CHIP_TSX_URI).content;

const SUFFIX_DYNAMIC_SCSS = `
.chip { color: slategray; }
.idle-chip { color: teal; }
.busy-chip { color: orange; }
.error-chip { color: crimson; }
`;

const PREFIX_SUFFIX_DYNAMIC_WORKSPACE = workspace({
  [BUTTON_CHIP_TSX_URI]: `import classNames from 'classnames/bind';
import styles from './ButtonChip.module.scss';
const cx = classNames.bind(styles);
export function ButtonChip(variant: string) {
  const derivedChipClass = 'btn-' + variant + '-chip';
  return <div className={cx('chip', derive/*|*/dChipClass)}>hi</div>;
}
`,
});

const PREFIX_SUFFIX_DYNAMIC_TSX = PREFIX_SUFFIX_DYNAMIC_WORKSPACE.file(BUTTON_CHIP_TSX_URI).content;

const PREFIX_SUFFIX_DYNAMIC_SCSS = `
.chip { color: slategray; }
.btn-idle-chip { color: teal; }
.btn-busy-chip { color: orange; }
.btn-error-chip { color: crimson; }
`;

function openButton(client: LspTestClient): void {
  client.didOpen({
    textDocument: {
      uri: BUTTON_TSX_URI,
      languageId: "typescriptreact",
      version: 1,
      text: BUTTON_TSX,
    },
  });
}

function fixturePosition(
  source: CmeWorkspace,
  filePath: string,
  markerName?: string,
): { line: number; character: number } {
  return targetFixture({ workspace: source, filePath, markerName }).position;
}

describe("definition protocol / clsx", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
  });

  const CLSX_WORKSPACE = workspace({
    [BUTTON_TSX_URI]: `import clsx from 'clsx';
import styles from './Button.module.scss';
export function Button() {
  return <div className={clsx(styles.indic/*|*/ator)}>hi</div>;
}
`,
  });

  const CLSX_TSX = CLSX_WORKSPACE.file(BUTTON_TSX_URI).content;

  const CLSX_SCSS = `
.indicator {
  color: red;
}
`;

  it("returns a LocationLink for styles.indicator inside clsx()", async () => {
    client = createInProcessServer({
      readStyleFile: (path) => (path.endsWith("Button.module.scss") ? CLSX_SCSS : null),
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: BUTTON_TSX_URI,
        languageId: "typescriptreact",
        version: 1,
        text: CLSX_TSX,
      },
    });
    // Line 3: "  return <div className={clsx(styles.indicator)}>hi</div>;"
    const result = await client.definition({
      textDocument: { uri: BUTTON_TSX_URI },
      position: fixturePosition(CLSX_WORKSPACE, BUTTON_TSX_URI),
    });
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    const links = result as Array<{ targetUri: string; originSelectionRange: unknown }>;
    expect(links).toHaveLength(1);
    expect(links[0]!.targetUri).toMatch(/Button\.module\.scss$/);
  });
});

describe("definition protocol", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
  });

  it("returns a LocationLink for cx('indicator')", async () => {
    client = createInProcessServer({
      readStyleFile: (path) => (path.endsWith("Button.module.scss") ? BUTTON_SCSS : null),
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    openButton(client);
    // Line 4 (0-based): "  return <div className={cx('indicator')}>hi</div>;"
    //                                               ↑ column 32 is inside 'indicator'
    const result = await client.definition({
      textDocument: { uri: BUTTON_TSX_URI },
      position: fixturePosition(BUTTON_TSX_WORKSPACE, BUTTON_TSX_URI),
    });
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    const links = result as Array<{ targetUri: string; originSelectionRange: unknown }>;
    expect(links).toHaveLength(1);
    expect(links[0]!.targetUri).toMatch(/Button\.module\.scss$/);
    expect(links[0]!.targetUri.startsWith("file://")).toBe(true);
    expect(links[0]!.originSelectionRange).toBeDefined();
  });

  it("returns all definitions when the same class appears under multiple nested parents", async () => {
    const actionsUri = "file:///fake/workspace/src/Actions.tsx";
    const tsxWorkspace = workspace({
      [actionsUri]: `import classNames from 'classnames/bind';
import styles from './Actions.module.scss';
const cx = classNames.bind(styles);
export function Actions() {
  return <div className={cx('ac/*|*/tion')}>hi</div>;
}
`,
    });
    const TSX = tsxWorkspace.file(actionsUri).content;
    const SCSS = `.panel {
  .action { color: red; }
  button.action { color: blue; }
}
.drawer {
  .action { color: green; }
}
`;
    client = createInProcessServer({
      readStyleFile: (path) => (path.endsWith("Actions.module.scss") ? SCSS : null),
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: actionsUri,
        languageId: "typescriptreact",
        version: 1,
        text: TSX,
      },
    });

    const result = await client.definition({
      textDocument: { uri: actionsUri },
      position: fixturePosition(tsxWorkspace, actionsUri),
    });

    expect(result).not.toBeNull();
    const links = result as Array<{ targetSelectionRange: { start: { line: number } } }>;
    expect(links.map((link) => link.targetSelectionRange.start.line)).toEqual([1, 2, 5]);
  });

  it("returns definition links for same-file helper derived class candidates", async () => {
    client = createInProcessServer({
      readStyleFile: (path) => (path.endsWith("Status.module.scss") ? FUNCTION_DYNAMIC_SCSS : null),
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: STATUS_TSX_URI,
        languageId: "typescriptreact",
        version: 1,
        text: FUNCTION_DYNAMIC_TSX,
      },
    });
    const result = await client.definition({
      textDocument: { uri: STATUS_TSX_URI },
      position: fixturePosition(FUNCTION_DYNAMIC_WORKSPACE, STATUS_TSX_URI),
    });
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    const links = result as Array<{ targetUri: string }>;
    expect(links).toHaveLength(3);
    expect(links.every((link) => link.targetUri.endsWith("Status.module.scss"))).toBe(true);
  });

  it("returns definition links for suffix-constrained derived class candidates", async () => {
    client = createInProcessServer({
      readStyleFile: (path) =>
        path.endsWith("StateChip.module.scss") ? SUFFIX_DYNAMIC_SCSS : null,
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: STATE_CHIP_TSX_URI,
        languageId: "typescriptreact",
        version: 1,
        text: SUFFIX_DYNAMIC_TSX,
      },
    });
    const result = await client.definition({
      textDocument: { uri: STATE_CHIP_TSX_URI },
      position: fixturePosition(SUFFIX_DYNAMIC_WORKSPACE, STATE_CHIP_TSX_URI),
    });
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    const links = result as Array<{ targetUri: string }>;
    expect(links).toHaveLength(3);
    expect(links.every((link) => link.targetUri.endsWith("StateChip.module.scss"))).toBe(true);
  });

  it("returns definition links for prefix-suffix constrained derived class candidates", async () => {
    client = createInProcessServer({
      readStyleFile: (path) =>
        path.endsWith("ButtonChip.module.scss") ? PREFIX_SUFFIX_DYNAMIC_SCSS : null,
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: BUTTON_CHIP_TSX_URI,
        languageId: "typescriptreact",
        version: 1,
        text: PREFIX_SUFFIX_DYNAMIC_TSX,
      },
    });
    const result = await client.definition({
      textDocument: { uri: BUTTON_CHIP_TSX_URI },
      position: fixturePosition(PREFIX_SUFFIX_DYNAMIC_WORKSPACE, BUTTON_CHIP_TSX_URI),
    });
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    const links = result as Array<{ targetUri: string }>;
    expect(links).toHaveLength(3);
    expect(links.every((link) => link.targetUri.endsWith("ButtonChip.module.scss"))).toBe(true);
  });

  it("returns null when the cursor is outside any cx call", async () => {
    client = createInProcessServer({
      readStyleFile: () => BUTTON_SCSS,
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    openButton(client);
    // Line 0 = the import statement. No cx call can span it.
    const result = await client.definition({
      textDocument: { uri: BUTTON_TSX_URI },
      position: fixturePosition(BUTTON_TSX_WORKSPACE, BUTTON_TSX_URI, "outside"),
    });
    expect(result).toBeNull();
  });

  it("returns null for an unknown class name", async () => {
    client = createInProcessServer({
      readStyleFile: () => ".other { color: red; }",
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    openButton(client);
    const result = await client.definition({
      textDocument: { uri: BUTTON_TSX_URI },
      position: fixturePosition(BUTTON_TSX_WORKSPACE, BUTTON_TSX_URI),
    });
    expect(result).toBeNull();
  });

  it("returns null for a file that does not import classnames/bind", async () => {
    const plainUri = "file:///fake/workspace/src/Plain.tsx";
    const plainWorkspace = workspace({
      [plainUri]: "const/*|*/ x = 1;\n",
    });
    client = createInProcessServer({
      readStyleFile: () => BUTTON_SCSS,
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: plainUri,
        languageId: "typescriptreact",
        version: 1,
        text: plainWorkspace.file(plainUri).content,
      },
    });
    const result = await client.definition({
      textDocument: { uri: plainUri },
      position: fixturePosition(plainWorkspace, plainUri),
    });
    expect(result).toBeNull();
  });

  it("navigates from a cross-file composes token to the target selector", async () => {
    const buttonScssUri = "file:///fake/workspace/src/Button.module.scss";
    const baseScssUri = "file:///fake/workspace/src/Base.module.scss";
    const composingWorkspace = workspace({
      [buttonScssUri]: `
.button {
  composes: b/*|*/ase from './Base.module.scss';
  color: red;
}
`,
    });
    const COMPOSING_SCSS = composingWorkspace.file(buttonScssUri).content;
    const BASE_SCSS = `
.base {
  color: blue;
}
`;
    client = createInProcessServer({
      readStyleFile: (path) => {
        if (path.endsWith("Button.module.scss")) return COMPOSING_SCSS;
        if (path.endsWith("Base.module.scss")) return BASE_SCSS;
        return null;
      },
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: buttonScssUri,
        languageId: "scss",
        version: 1,
        text: COMPOSING_SCSS,
      },
    });
    client.didOpen({
      textDocument: {
        uri: baseScssUri,
        languageId: "scss",
        version: 1,
        text: BASE_SCSS,
      },
    });

    const result = await client.definition({
      textDocument: { uri: buttonScssUri },
      position: fixturePosition(composingWorkspace, buttonScssUri),
    });
    expect(result).not.toBeNull();
    const links = result as Array<{ targetUri: string }>;
    expect(links).toHaveLength(1);
    expect(links[0]!.targetUri).toMatch(/Base\.module\.scss$/);
  });

  it("navigates from a same-file composes token to the canonical selector", async () => {
    const sameFileWorkspace = workspace({
      [BUTTON_SCSS_URI]: `
.base {
  color: blue;
}

.button {
  composes: b/*|*/ase;
  color: red;
}
`,
    });
    const SAME_FILE_SCSS = sameFileWorkspace.file(BUTTON_SCSS_URI).content;
    client = createInProcessServer({
      readStyleFile: (path) => (path.endsWith("Button.module.scss") ? SAME_FILE_SCSS : null),
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: BUTTON_SCSS_URI,
        languageId: "scss",
        version: 1,
        text: SAME_FILE_SCSS,
      },
    });

    const result = await client.definition({
      textDocument: { uri: BUTTON_SCSS_URI },
      position: fixturePosition(sameFileWorkspace, BUTTON_SCSS_URI),
    });
    expect(result).not.toBeNull();
    const links = result as Array<{
      targetUri: string;
      targetSelectionRange: { start: { line: number } };
    }>;
    expect(links).toHaveLength(1);
    expect(links[0]!.targetUri).toMatch(/Button\.module\.scss$/);
    expect(links[0]!.targetSelectionRange.start.line).toBe(1);
  });

  it("navigates from an animation token to its @keyframes declaration", async () => {
    client = createInProcessServer({
      readStyleFile: (path) => (path.endsWith("Button.module.scss") ? KEYFRAMES_SCSS : null),
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: BUTTON_SCSS_URI,
        languageId: "scss",
        version: 1,
        text: KEYFRAMES_SCSS,
      },
    });

    const result = await client.definition({
      textDocument: { uri: BUTTON_SCSS_URI },
      position: fixturePosition(KEYFRAMES_WORKSPACE, BUTTON_SCSS_URI),
    });
    expect(result).not.toBeNull();
    const links = result as Array<{
      targetUri: string;
      targetSelectionRange: { start: { line: number } };
    }>;
    expect(links).toHaveLength(1);
    expect(links[0]!.targetUri).toBe(BUTTON_SCSS_URI);
    expect(links[0]!.targetSelectionRange.start.line).toBe(0);
  });

  it("navigates from a value token to its @value declaration", async () => {
    client = createInProcessServer({
      readStyleFile: (path) => (path.endsWith("Button.module.scss") ? VALUE_SCSS : null),
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: BUTTON_SCSS_URI,
        languageId: "scss",
        version: 1,
        text: VALUE_SCSS,
      },
    });

    const result = await client.definition({
      textDocument: { uri: BUTTON_SCSS_URI },
      position: fixturePosition(VALUE_WORKSPACE, BUTTON_SCSS_URI),
    });
    expect(result).not.toBeNull();
    const links = result as Array<{
      targetUri: string;
      targetSelectionRange: { start: { line: number } };
    }>;
    expect(links).toHaveLength(1);
    expect(links[0]!.targetUri).toBe(BUTTON_SCSS_URI);
    expect(links[0]!.targetSelectionRange.start.line).toBe(0);
  });

  it("navigates from an imported value token to the source @value declaration", async () => {
    const tokensUri = "file:///fake/workspace/src/tokens.module.scss";
    client = createInProcessServer({
      readStyleFile: (path) => {
        if (path.endsWith("Button.module.scss")) return IMPORTED_VALUE_SCSS;
        if (path.endsWith("tokens.module.scss")) return TOKENS_SCSS;
        return null;
      },
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: BUTTON_SCSS_URI,
        languageId: "scss",
        version: 1,
        text: IMPORTED_VALUE_SCSS,
      },
    });

    const result = await client.definition({
      textDocument: { uri: BUTTON_SCSS_URI },
      position: fixturePosition(IMPORTED_VALUE_WORKSPACE, BUTTON_SCSS_URI),
    });
    expect(result).not.toBeNull();
    const links = result as Array<{
      targetUri: string;
      targetSelectionRange: { start: { line: number } };
    }>;
    expect(links).toHaveLength(1);
    expect(links[0]!.targetUri).toBe(tokensUri);
    expect(links[0]!.targetSelectionRange.start.line).toBe(0);
  });

  it("navigates from Sass symbol references to same-file declarations", async () => {
    client = createInProcessServer({
      readStyleFile: (path) => (path.endsWith("Button.module.scss") ? SASS_SYMBOL_SCSS : null),
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: BUTTON_SCSS_URI,
        languageId: "scss",
        version: 1,
        text: SASS_SYMBOL_SCSS,
      },
    });

    const variableResult = await client.definition({
      textDocument: { uri: BUTTON_SCSS_URI },
      position: fixturePosition(SASS_SYMBOL_WORKSPACE, BUTTON_SCSS_URI, "variable"),
    });
    expect(variableResult).not.toBeNull();
    const variableLinks = variableResult as Array<{
      targetUri: string;
      targetSelectionRange: { start: { line: number } };
    }>;
    expect(variableLinks).toHaveLength(1);
    expect(variableLinks[0]!.targetUri).toBe(BUTTON_SCSS_URI);
    expect(variableLinks[0]!.targetSelectionRange.start.line).toBe(0);

    const mixinResult = await client.definition({
      textDocument: { uri: BUTTON_SCSS_URI },
      position: fixturePosition(SASS_SYMBOL_WORKSPACE, BUTTON_SCSS_URI, "mixin"),
    });
    expect(mixinResult).not.toBeNull();
    const mixinLinks = mixinResult as Array<{
      targetUri: string;
      targetSelectionRange: { start: { line: number } };
    }>;
    expect(mixinLinks).toHaveLength(1);
    expect(mixinLinks[0]!.targetUri).toBe(BUTTON_SCSS_URI);
    expect(mixinLinks[0]!.targetSelectionRange.start.line).toBe(1);
  });

  it("returns multiple LocationLinks for a union-typed cx(variable) call", async () => {
    const sizedUri = "file:///fake/workspace/src/Sized.tsx";
    const sizedWorkspace = workspace({
      [sizedUri]: `import classNames from 'classnames/bind';
import styles from './Sized.module.scss';
const cx = classNames.bind(styles);
export function Sized({ size }: { size: 'small' | 'medium' }) {
  return <div className={cx(si/*|*/ze)}>hi</div>;
}
`,
    });
    const SIZED_TSX = sizedWorkspace.file(sizedUri).content;
    const SIZED_SCSS = `
.small { font-size: 12px; }
.medium { font-size: 16px; }
.large { font-size: 20px; }
`;
    client = createInProcessServer({
      readStyleFile: (path) => (path.endsWith("Sized.module.scss") ? SIZED_SCSS : null),
      typeResolver: new FakeTypeResolver(["small", "medium"]),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: sizedUri,
        languageId: "typescriptreact",
        version: 1,
        text: SIZED_TSX,
      },
    });
    // Line 4 (0-based): "  return <div className={cx(size)}>hi</div>;"
    //                                               ↑ column 30 is inside `size`
    const result = await client.definition({
      textDocument: { uri: sizedUri },
      position: fixturePosition(sizedWorkspace, sizedUri),
    });
    expect(result).not.toBeNull();
    const links = result as Array<{ targetUri: string }>;
    expect(links).toHaveLength(2);
  });

  it("returns multiple LocationLinks for a locally reassigned cx(variable) call", async () => {
    const sizedUri = "file:///fake/workspace/src/Sized.tsx";
    const sizedWorkspace = workspace({
      [sizedUri]: `import classNames from 'classnames/bind';
import styles from './Sized.module.scss';
const cx = classNames.bind(styles);
export function Sized(flag: boolean) {
  let size = 'sm';
  if (flag) {
    size = 'lg';
  }
  return <div className={cx(si/*|*/ze)}>hi</div>;
}
`,
    });
    const SIZED_TSX = sizedWorkspace.file(sizedUri).content;
    const SIZED_SCSS = `
.sm { font-size: 12px; }
.lg { font-size: 20px; }
`;
    client = createInProcessServer({
      readStyleFile: (path) => (path.endsWith("Sized.module.scss") ? SIZED_SCSS : null),
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: sizedUri,
        languageId: "typescriptreact",
        version: 1,
        text: SIZED_TSX,
      },
    });
    const result = await client.definition({
      textDocument: { uri: sizedUri },
      position: fixturePosition(sizedWorkspace, sizedUri),
    });
    expect(result).not.toBeNull();
    const links = result as Array<{ targetUri: string }>;
    expect(links).toHaveLength(2);
  });
});
