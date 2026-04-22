import { expect, test } from "../_fixtures/protocol";
import { FakeTypeResolver } from "../_fixtures/fake-type-resolver";

const SCSS_URI = "file:///fake/workspace/src/Button.module.scss";

test("references protocol returns TSX sites for cx('indicator')", async ({ makeClient }) => {
  const tsxUri = "file:///fake/workspace/src/Button.tsx";
  const tsx = `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function Button() {
  return <div className={cx('indicator')}>hi</div>;
}
`;
  const scss = `.indicator { color: red; }\n.other { color: blue; }\n`;

  const client = makeClient({
    readStyleFile: (path) => (path.endsWith("Button.module.scss") ? scss : null),
    typeResolver: new FakeTypeResolver(),
  });

  await client.initialize();
  client.initialized();
  client.didOpen({
    textDocument: {
      uri: tsxUri,
      languageId: "typescriptreact",
      version: 1,
      text: tsx,
    },
  });
  await client.waitForDiagnostics(tsxUri);

  const result = await client.references({
    textDocument: { uri: SCSS_URI },
    position: { line: 0, character: 2 },
    context: { includeDeclaration: false },
  });

  expect(result).not.toBeNull();
  expect(result).toHaveLength(1);
  expect(result![0]!.uri).toBe(tsxUri);
  expect(result![0]!.range.start.line).toBe(4);
});

test("references protocol returns TSX sites from a TSX cursor on cx('indicator')", async ({
  makeClient,
}) => {
  const tsxUri = "file:///fake/workspace/src/Button.tsx";
  const tsx = `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function Button() {
  return <div className={cx('indicator')}>hi</div>;
}
`;
  const scss = `.indicator { color: red; }\n.other { color: blue; }\n`;

  const client = makeClient({
    readStyleFile: (path) => (path.endsWith("Button.module.scss") ? scss : null),
    typeResolver: new FakeTypeResolver(),
  });

  await client.initialize();
  client.initialized();
  client.didOpen({
    textDocument: {
      uri: tsxUri,
      languageId: "typescriptreact",
      version: 1,
      text: tsx,
    },
  });
  await client.waitForDiagnostics(tsxUri);

  const result = await client.references({
    textDocument: { uri: tsxUri },
    position: { line: 4, character: 33 },
    context: { includeDeclaration: false },
  });

  expect(result).not.toBeNull();
  expect(result).toHaveLength(1);
  expect(result![0]!.uri).toBe(tsxUri);
  expect(result![0]!.range.start.line).toBe(4);
});

test("references protocol returns TSX sites for clsx(styles.indicator)", async ({ makeClient }) => {
  const tsxUri = "file:///fake/workspace/src/ClsxButton.tsx";
  const tsx = `import clsx from 'clsx';
import styles from './Button.module.scss';
export function Button() {
  return <div className={clsx(styles.indicator)}>hi</div>;
}
`;
  const scss = `.indicator { color: red; }\n`;

  const client = makeClient({
    readStyleFile: (path) => (path.endsWith("Button.module.scss") ? scss : null),
    typeResolver: new FakeTypeResolver(),
  });

  await client.initialize();
  client.initialized();
  client.didOpen({
    textDocument: {
      uri: tsxUri,
      languageId: "typescriptreact",
      version: 1,
      text: tsx,
    },
  });
  await client.waitForDiagnostics(tsxUri);

  const result = await client.references({
    textDocument: { uri: SCSS_URI },
    position: { line: 0, character: 2 },
    context: { includeDeclaration: false },
  });

  expect(result).not.toBeNull();
  expect(result).toHaveLength(1);
  expect(result![0]!.uri).toBe(tsxUri);
  expect(result![0]!.range.start.line).toBe(3);
});

test("references protocol returns TSX sites for bracket-access styles['btn-primary']", async ({
  makeClient,
}) => {
  const tsxUri = "file:///fake/workspace/src/StyleAccessButton.tsx";
  const tsx = `import styles from './Button.module.scss';
export function Button() {
  return <div className={styles['btn-primary']}>hi</div>;
}
`;
  const scss = `.btn-primary { color: red; }\n.note { color: slateblue; }\n`;

  const client = makeClient({
    readStyleFile: (path) => (path.endsWith("Button.module.scss") ? scss : null),
    typeResolver: new FakeTypeResolver(),
  });

  await client.initialize();
  client.initialized();
  client.didOpen({
    textDocument: {
      uri: tsxUri,
      languageId: "typescriptreact",
      version: 1,
      text: tsx,
    },
  });
  await client.waitForDiagnostics(tsxUri);

  const result = await client.references({
    textDocument: { uri: SCSS_URI },
    position: { line: 0, character: 2 },
    context: { includeDeclaration: false },
  });

  expect(result).not.toBeNull();
  expect(result).toHaveLength(1);
  expect(result![0]!.uri).toBe(tsxUri);
  expect(result![0]!.range.start.line).toBe(2);
});

test("references protocol returns TSX sites for locally reassigned cx(variable)", async ({
  makeClient,
}) => {
  const tsxUri = "file:///fake/workspace/src/Sized.tsx";
  const tsx = `import classNames from 'classnames/bind';
import styles from './Sized.module.scss';
const cx = classNames.bind(styles);
export function Sized(flag: boolean) {
  let size = 'sm';
  if (flag) {
    size = 'lg';
  }
  return <div className={cx(size)}>hi</div>;
}
`;
  const scss = `.sm { font-size: 12px; }\n.lg { font-size: 20px; }\n`;

  const client = makeClient({
    readStyleFile: (path) => (path.endsWith("Sized.module.scss") ? scss : null),
    typeResolver: new FakeTypeResolver(),
  });

  await client.initialize();
  client.initialized();
  client.didOpen({
    textDocument: {
      uri: tsxUri,
      languageId: "typescriptreact",
      version: 1,
      text: tsx,
    },
  });
  await client.waitForDiagnostics(tsxUri);

  const result = await client.references({
    textDocument: { uri: "file:///fake/workspace/src/Sized.module.scss" },
    position: { line: 0, character: 2 },
    context: { includeDeclaration: false },
  });

  expect(result).not.toBeNull();
  expect(result).toHaveLength(1);
  expect(result![0]!.uri).toBe(tsxUri);
  expect(result![0]!.range.start.line).toBe(8);
});

test("references protocol returns helper-derived TSX sites for finite same-file call results", async ({
  makeClient,
}) => {
  const tsxUri = "file:///fake/workspace/src/Status.tsx";
  const scssUri = "file:///fake/workspace/src/Status.module.scss";
  const tsx = `import classNames from 'classnames/bind';
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
  const scss = `.chip { color: slategray; }\n.state-idle { color: teal; }\n.state-busy { color: orange; }\n.state-error { color: crimson; }\n`;

  const client = makeClient({
    readStyleFile: (path) => (path.endsWith("Status.module.scss") ? scss : null),
    typeResolver: new FakeTypeResolver(),
  });

  await client.initialize();
  client.initialized();
  client.didOpen({
    textDocument: {
      uri: tsxUri,
      languageId: "typescriptreact",
      version: 1,
      text: tsx,
    },
  });
  await client.waitForDiagnostics(tsxUri);

  const result = await client.references({
    textDocument: { uri: scssUri },
    position: { line: 1, character: 3 },
    context: { includeDeclaration: false },
  });

  expect(result).not.toBeNull();
  expect(result).toHaveLength(1);
  expect(result![0]!.uri).toBe(tsxUri);
  expect(result![0]!.range.start.line).toBe(18);
});

test("references protocol returns suffix-derived TSX sites for unknown-left concatenation", async ({
  makeClient,
}) => {
  const tsxUri = "file:///fake/workspace/src/StateChip.tsx";
  const scssUri = "file:///fake/workspace/src/StateChip.module.scss";
  const tsx = `import classNames from 'classnames/bind';
import styles from './StateChip.module.scss';
const cx = classNames.bind(styles);
export function StateChip(variant: string) {
  const derivedChipClass = variant + '-chip';
  return <div className={cx('chip', derivedChipClass)}>hi</div>;
}
`;
  const scss = `.chip { color: slategray; }\n.idle-chip { color: teal; }\n.busy-chip { color: orange; }\n.error-chip { color: crimson; }\n`;

  const client = makeClient({
    readStyleFile: (path) => (path.endsWith("StateChip.module.scss") ? scss : null),
    typeResolver: new FakeTypeResolver(),
  });

  await client.initialize();
  client.initialized();
  client.didOpen({
    textDocument: {
      uri: tsxUri,
      languageId: "typescriptreact",
      version: 1,
      text: tsx,
    },
  });
  await client.waitForDiagnostics(tsxUri);

  const result = await client.references({
    textDocument: { uri: scssUri },
    position: { line: 1, character: 3 },
    context: { includeDeclaration: false },
  });

  expect(result).not.toBeNull();
  expect(result).toHaveLength(1);
  expect(result![0]!.uri).toBe(tsxUri);
  expect(result![0]!.range.start.line).toBe(5);
});

test("references protocol returns prefix-suffix-derived TSX sites for known-edge concatenation", async ({
  makeClient,
}) => {
  const tsxUri = "file:///fake/workspace/src/ButtonChip.tsx";
  const scssUri = "file:///fake/workspace/src/ButtonChip.module.scss";
  const tsx = `import classNames from 'classnames/bind';
import styles from './ButtonChip.module.scss';
const cx = classNames.bind(styles);
export function ButtonChip(variant: string) {
  const derivedChipClass = 'btn-' + variant + '-chip';
  return <div className={cx('chip', derivedChipClass)}>hi</div>;
}
`;
  const scss = `.chip { color: slategray; }\n.btn-idle-chip { color: teal; }\n.btn-busy-chip { color: orange; }\n.btn-error-chip { color: crimson; }\n`;

  const client = makeClient({
    readStyleFile: (path) => (path.endsWith("ButtonChip.module.scss") ? scss : null),
    typeResolver: new FakeTypeResolver(),
  });

  await client.initialize();
  client.initialized();
  client.didOpen({
    textDocument: {
      uri: tsxUri,
      languageId: "typescriptreact",
      version: 1,
      text: tsx,
    },
  });
  await client.waitForDiagnostics(tsxUri);

  const result = await client.references({
    textDocument: { uri: scssUri },
    position: { line: 1, character: 6 },
    context: { includeDeclaration: false },
  });

  expect(result).not.toBeNull();
  expect(result).toHaveLength(1);
  expect(result![0]!.uri).toBe(tsxUri);
  expect(result![0]!.range.start.line).toBe(5);
});

test("references protocol resolves a cross-file composes token to the target selector usage", async ({
  makeClient,
}) => {
  const tsxUri = "file:///fake/workspace/src/Button.tsx";
  const baseTsxUri = "file:///fake/workspace/src/Base.tsx";
  const tsx = `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function Button() {
  return <div className={cx('button')}>hi</div>;
}
`;
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

  const client = makeClient({
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
      text: tsx,
    },
  });
  client.didOpen({
    textDocument: {
      uri: baseTsxUri,
      languageId: "typescriptreact",
      version: 1,
      text: baseTsx,
    },
  });
  client.didOpen({
    textDocument: {
      uri: "file:///fake/workspace/src/Button.module.scss",
      languageId: "scss",
      version: 1,
      text: buttonScss,
    },
  });
  client.didOpen({
    textDocument: {
      uri: "file:///fake/workspace/src/Base.module.scss",
      languageId: "scss",
      version: 1,
      text: baseScss,
    },
  });
  await client.waitForDiagnostics(tsxUri);
  await client.waitForDiagnostics(baseTsxUri);

  const result = await client.references({
    textDocument: { uri: "file:///fake/workspace/src/Button.module.scss" },
    position: { line: 2, character: 13 },
    context: { includeDeclaration: false },
  });

  expect(result).not.toBeNull();
  expect(result!.some((location) => location.uri === baseTsxUri)).toBe(true);
  expect(result!.some((location) => location.uri.endsWith("Button.module.scss"))).toBe(true);
});

test("references protocol returns same-file animation references for @keyframes", async ({
  makeClient,
}) => {
  const scssUri = "file:///fake/workspace/src/Button.module.scss";
  const scss = `@keyframes fade {
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

  const client = makeClient({
    readStyleFile: (path) => (path.endsWith("Button.module.scss") ? scss : null),
    typeResolver: new FakeTypeResolver(),
  });

  await client.initialize();
  client.initialized();
  client.didOpen({
    textDocument: {
      uri: scssUri,
      languageId: "scss",
      version: 1,
      text: scss,
    },
  });

  const result = await client.references({
    textDocument: { uri: scssUri },
    position: { line: 0, character: 13 },
    context: { includeDeclaration: true },
  });

  expect(result).not.toBeNull();
  expect(result).toHaveLength(3);
  expect(result!.every((location) => location.uri === scssUri)).toBe(true);
  expect(result!.some((location) => location.range.start.line === 6)).toBe(true);
  expect(result!.some((location) => location.range.start.line === 10)).toBe(true);
});

test("references protocol returns same-file value references for @value", async ({
  makeClient,
}) => {
  const scssUri = "file:///fake/workspace/src/Button.module.scss";
  const scss = `@value primary: #ff3355;

.button {
  color: primary;
}
`;

  const client = makeClient({
    readStyleFile: (path) => (path.endsWith("Button.module.scss") ? scss : null),
    typeResolver: new FakeTypeResolver(),
  });

  await client.initialize();
  client.initialized();
  client.didOpen({
    textDocument: {
      uri: scssUri,
      languageId: "scss",
      version: 1,
      text: scss,
    },
  });

  const result = await client.references({
    textDocument: { uri: scssUri },
    position: { line: 0, character: 9 },
    context: { includeDeclaration: true },
  });

  expect(result).not.toBeNull();
  expect(result).toHaveLength(2);
  expect(result!.every((location) => location.uri === scssUri)).toBe(true);
  expect(result!.some((location) => location.range.start.line === 0)).toBe(true);
  expect(result!.some((location) => location.range.start.line === 3)).toBe(true);
});

test("references protocol returns local import sites and source declaration for imported @value", async ({
  makeClient,
}) => {
  const scssUri = "file:///fake/workspace/src/Button.module.scss";
  const tokensUri = "file:///fake/workspace/src/tokens.module.scss";
  const scss = `@value primary from "./tokens.module.scss";

.button {
  color: primary;
}
`;
  const tokens = `@value primary: #ff3355;`;

  const client = makeClient({
    readStyleFile: (path) => {
      if (path.endsWith("Button.module.scss")) return scss;
      if (path.endsWith("tokens.module.scss")) return tokens;
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
      text: scss,
    },
  });

  const result = await client.references({
    textDocument: { uri: scssUri },
    position: { line: 3, character: 10 },
    context: { includeDeclaration: true },
  });

  expect(result).not.toBeNull();
  expect(result).toHaveLength(3);
  expect(
    result!.some((location) => location.uri === tokensUri && location.range.start.line === 0),
  ).toBe(true);
  expect(
    result!.some((location) => location.uri === scssUri && location.range.start.line === 0),
  ).toBe(true);
  expect(
    result!.some((location) => location.uri === scssUri && location.range.start.line === 3),
  ).toBe(true);
});
