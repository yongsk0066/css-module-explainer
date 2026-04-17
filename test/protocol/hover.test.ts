import { afterEach, describe, expect, it } from "vitest";
import { createInProcessServer, type LspTestClient } from "./_harness/in-process-server";
import { FakeTypeResolver } from "../_fixtures/fake-type-resolver";

const BUTTON_TSX = `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function Button() {
  return <div className={cx('indicator')}>hi</div>;
}
`;

const BUTTON_SCSS = `
.indicator {
  color: red;
  font-size: 14px;
}
`;

const KEYFRAMES_SCSS = `@keyframes fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.box {
  animation: fade 1s linear;
}

.pulse {
  animation-name: fade;
}
`;

const VALUE_SCSS = `@value primary: #ff3355;

.button {
  color: primary;
}
`;

const IMPORTED_VALUE_SCSS = `@value primary from "./tokens.module.scss";

.button {
  color: primary;
}
`;

const TOKENS_SCSS = `@value primary: #ff3355;`;

const FUNCTION_DYNAMIC_TSX = `import classNames from 'classnames/bind';
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
  return <div className={cx('chip', derivedStatusClass)}>hi</div>;
}
`;

const FUNCTION_DYNAMIC_SCSS = `
.chip { color: slategray; }
.state-idle { color: teal; }
.state-busy { color: orange; }
.state-error { color: crimson; }
`;

const SUFFIX_DYNAMIC_TSX = `import classNames from 'classnames/bind';
import styles from './StateChip.module.scss';
const cx = classNames.bind(styles);
export function StateChip(variant: string) {
  const derivedChipClass = variant + '-chip';
  return <div className={cx('chip', derivedChipClass)}>hi</div>;
}
`;

const SUFFIX_DYNAMIC_SCSS = `
.chip { color: slategray; }
.idle-chip { color: teal; }
.busy-chip { color: orange; }
.error-chip { color: crimson; }
`;

describe("hover protocol / clsx", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
  });

  const CLSX_TSX = `import clsx from 'clsx';
import styles from './Button.module.scss';
export function Button() {
  return <div className={clsx(styles.indicator)}>hi</div>;
}
`;

  const CLSX_SCSS = `
.indicator {
  color: red;
  font-size: 14px;
}
`;

  it("returns a markdown Hover for styles.indicator inside clsx()", async () => {
    client = createInProcessServer({
      readStyleFile: (path) => (path.endsWith("Button.module.scss") ? CLSX_SCSS : null),
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: "file:///fake/workspace/src/Button.tsx",
        languageId: "typescriptreact",
        version: 1,
        text: CLSX_TSX,
      },
    });
    // Line 3: "  return <div className={clsx(styles.indicator)}>hi</div>;"
    // "indicator" starts at character 38 (after "styles.")
    const hover = await client.hover({
      textDocument: { uri: "file:///fake/workspace/src/Button.tsx" },
      position: { line: 3, character: 42 },
    });
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain("`.indicator`");
    expect(value).toContain("color: red;");
  });
});

describe("hover protocol", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
  });

  it("returns a markdown Hover for cx('indicator')", async () => {
    client = createInProcessServer({
      readStyleFile: (path) => (path.endsWith("Button.module.scss") ? BUTTON_SCSS : null),
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
    const hover = await client.hover({
      textDocument: { uri: "file:///fake/workspace/src/Button.tsx" },
      position: { line: 4, character: 34 },
    });
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain("`.indicator`");
    expect(value).toContain("color: red;");
    expect(value).toContain("font-size: 14px;");
  });

  it("returns a hover for same-file helper derived class candidates", async () => {
    client = createInProcessServer({
      readStyleFile: (path) => (path.endsWith("Status.module.scss") ? FUNCTION_DYNAMIC_SCSS : null),
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: "file:///fake/workspace/src/Status.tsx",
        languageId: "typescriptreact",
        version: 1,
        text: FUNCTION_DYNAMIC_TSX,
      },
    });
    const hover = await client.hover({
      textDocument: { uri: "file:///fake/workspace/src/Status.tsx" },
      position: { line: 18, character: 40 },
    });
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain("state-idle");
    expect(value).toContain("state-busy");
    expect(value).toContain("state-error");
  });

  it("returns a hover for suffix-constrained derived class candidates", async () => {
    client = createInProcessServer({
      readStyleFile: (path) =>
        path.endsWith("StateChip.module.scss") ? SUFFIX_DYNAMIC_SCSS : null,
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: "file:///fake/workspace/src/StateChip.tsx",
        languageId: "typescriptreact",
        version: 1,
        text: SUFFIX_DYNAMIC_TSX,
      },
    });
    const hover = await client.hover({
      textDocument: { uri: "file:///fake/workspace/src/StateChip.tsx" },
      position: { line: 5, character: 42 },
    });
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain("idle-chip");
    expect(value).toContain("busy-chip");
    expect(value).toContain("error-chip");
    expect(value).toContain("Value domain: suffix `-chip`.");
    expect(value).toContain(
      "Value certainty reason: known suffix preserved while prepending an unknown prefix.",
    );
  });

  it("returns a selector hover for SCSS declarations", async () => {
    client = createInProcessServer({
      readStyleFile: (path) => (path.endsWith("Button.module.scss") ? BUTTON_SCSS : null),
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    const tsxUri = "file:///fake/workspace/src/Button.tsx";
    const scssUri = "file:///fake/workspace/src/Button.module.scss";
    client.didOpen({
      textDocument: {
        uri: tsxUri,
        languageId: "typescriptreact",
        version: 1,
        text: BUTTON_TSX,
      },
    });
    client.didOpen({
      textDocument: {
        uri: scssUri,
        languageId: "scss",
        version: 1,
        text: BUTTON_SCSS,
      },
    });
    await client.waitForDiagnostics(tsxUri);

    const hover = await client.hover({
      textDocument: { uri: scssUri },
      position: { line: 1, character: 3 },
    });
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain("`.indicator`");
    expect(value).toContain("References: 1 total.");
    expect(value).toContain("color: red;");
  });

  it("returns a selector hover for a cross-file composes token", async () => {
    const tsxUri = "file:///fake/workspace/src/Base.tsx";
    const buttonScssUri = "file:///fake/workspace/src/Button.module.scss";
    const baseScssUri = "file:///fake/workspace/src/Base.module.scss";
    const baseTsx = `import classNames from 'classnames/bind';
import styles from './Base.module.scss';
const cx = classNames.bind(styles);
export function Base() {
  return <div className={cx('base')}>hi</div>;
}
`;
    const buttonScss = `
.button {
  composes: base from './Base.module.scss';
  color: red;
}
`;
    const baseScss = `
.base {
  color: blue;
}
`;
    client = createInProcessServer({
      readStyleFile: (path) => {
        if (path.endsWith("Button.module.scss")) return buttonScss;
        if (path.endsWith("Base.module.scss")) return baseScss;
        return null;
      },
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: tsxUri,
        languageId: "typescriptreact",
        version: 1,
        text: baseTsx,
      },
    });
    client.didOpen({
      textDocument: {
        uri: buttonScssUri,
        languageId: "scss",
        version: 1,
        text: buttonScss,
      },
    });
    client.didOpen({
      textDocument: {
        uri: baseScssUri,
        languageId: "scss",
        version: 1,
        text: baseScss,
      },
    });
    await client.waitForDiagnostics(tsxUri);

    const hover = await client.hover({
      textDocument: { uri: buttonScssUri },
      position: { line: 2, character: 13 },
    });
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain("`.base`");
    expect(value).toContain("Referenced via `composes` from `.button`");
    expect(value).toContain("color: blue;");
  });

  it("returns null on unknown class", async () => {
    client = createInProcessServer({
      readStyleFile: () => ".other { color: red; }",
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
    const hover = await client.hover({
      textDocument: { uri: "file:///fake/workspace/src/Button.tsx" },
      position: { line: 4, character: 34 },
    });
    expect(hover).toBeNull();
  });

  it("returns a keyframes hover for @keyframes declarations", async () => {
    const scssUri = "file:///fake/workspace/src/Button.module.scss";
    client = createInProcessServer({
      readStyleFile: (path) => (path.endsWith("Button.module.scss") ? KEYFRAMES_SCSS : null),
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: scssUri,
        languageId: "scss",
        version: 1,
        text: KEYFRAMES_SCSS,
      },
    });

    const hover = await client.hover({
      textDocument: { uri: scssUri },
      position: { line: 0, character: 13 },
    });
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain("`@keyframes fade`");
    expect(value).toContain("2 animation references");
  });

  it("returns a value hover for @value declarations", async () => {
    const scssUri = "file:///fake/workspace/src/Button.module.scss";
    client = createInProcessServer({
      readStyleFile: (path) => (path.endsWith("Button.module.scss") ? VALUE_SCSS : null),
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: scssUri,
        languageId: "scss",
        version: 1,
        text: VALUE_SCSS,
      },
    });

    const hover = await client.hover({
      textDocument: { uri: scssUri },
      position: { line: 0, character: 9 },
    });
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain("`@value primary`");
    expect(value).toContain("1 value reference");
  });

  it("returns a value hover for imported @value usages", async () => {
    const scssUri = "file:///fake/workspace/src/Button.module.scss";
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
        uri: scssUri,
        languageId: "scss",
        version: 1,
        text: IMPORTED_VALUE_SCSS,
      },
    });

    const hover = await client.hover({
      textDocument: { uri: scssUri },
      position: { line: 3, character: 10 },
    });
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain("`@value primary`");
    expect(value).toContain("imported from `./tokens.module.scss` as `primary`");
  });

  it("includes dynamic explanation for a flow-resolved symbol ref", async () => {
    const FLOW_TSX = `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function Button(enabled: boolean) {
  const size = enabled ? 'indicator' : 'active';
  return <div className={cx(size)}>hi</div>;
}
`;
    client = createInProcessServer({
      readStyleFile: (path) => (path.endsWith("Button.module.scss") ? BUTTON_SCSS : null),
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: "file:///fake/workspace/src/Button.tsx",
        languageId: "typescriptreact",
        version: 1,
        text: FLOW_TSX,
      },
    });
    const hover = await client.hover({
      textDocument: { uri: "file:///fake/workspace/src/Button.tsx" },
      position: { line: 5, character: 29 },
    });
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain("Resolved from `size` via branched local flow analysis.");
    expect(value).toContain("Value certainty: inferred.");
    expect(value).toContain("Value certainty shape: bounded finite (2).");
    expect(value).toContain(
      "Value certainty reason: analysis preserved multiple finite candidate values.",
    );
    expect(value).toContain("Selector certainty: inferred.");
    expect(value).toContain("Candidates: `active`, `indicator`.");
  });
});
