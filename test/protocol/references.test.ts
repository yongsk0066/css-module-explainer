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
