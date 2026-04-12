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
