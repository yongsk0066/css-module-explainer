import { expect, test } from "../_fixtures/protocol";
import { FakeTypeResolver } from "../_fixtures/fake-type-resolver";
import { targetFixture, workspace, type CmeWorkspace } from "../../packages/vitest-cme/src";

const SCSS_URI = "file:///fake/workspace/src/Button.module.scss";

function fixture(
  filePath: string,
  content: string,
): {
  readonly content: string;
  readonly position: { readonly line: number; readonly character: number };
  readonly workspace: CmeWorkspace;
} {
  const source = workspace({ [filePath]: content });
  return {
    content: source.file(filePath).content,
    position: targetFixture({ workspace: source, filePath }).position,
    workspace: source,
  };
}

test("references protocol returns TSX sites for cx('indicator')", async ({ makeClient }) => {
  const tsxUri = "file:///fake/workspace/src/Button.tsx";
  const tsx = `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function Button() {
  return <div className={cx('indicator')}>hi</div>;
}
`;
  const scssFixture = fixture(
    SCSS_URI,
    `.i/*|*/ndicator { color: red; }\n.other { color: blue; }\n`,
  );
  const scss = scssFixture.content;

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
    position: scssFixture.position,
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
  const tsxFixture = fixture(
    tsxUri,
    `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function Button() {
  return <div className={cx('indi/*|*/cator')}>hi</div>;
}
`,
  );
  const tsx = tsxFixture.content;
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
    position: tsxFixture.position,
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
  const scssFixture = fixture(SCSS_URI, `.i/*|*/ndicator { color: red; }\n`);
  const scss = scssFixture.content;

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
    position: scssFixture.position,
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
  const scssFixture = fixture(
    SCSS_URI,
    `.b/*|*/tn-primary { color: red; }\n.note { color: slateblue; }\n`,
  );
  const scss = scssFixture.content;

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
    position: scssFixture.position,
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
  const scssUri = "file:///fake/workspace/src/Sized.module.scss";
  const scssFixture = fixture(scssUri, `.s/*|*/m { font-size: 12px; }\n.lg { font-size: 20px; }\n`);
  const scss = scssFixture.content;

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
    textDocument: { uri: scssUri },
    position: scssFixture.position,
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
  const scssFixture = fixture(
    scssUri,
    `.chip { color: slategray; }\n.st/*|*/ate-idle { color: teal; }\n.state-busy { color: orange; }\n.state-error { color: crimson; }\n`,
  );
  const scss = scssFixture.content;

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
    position: scssFixture.position,
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
  const scssFixture = fixture(
    scssUri,
    `.chip { color: slategray; }\n.id/*|*/le-chip { color: teal; }\n.busy-chip { color: orange; }\n.error-chip { color: crimson; }\n`,
  );
  const scss = scssFixture.content;

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
    position: scssFixture.position,
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
  const scssFixture = fixture(
    scssUri,
    `.chip { color: slategray; }\n.btn-i/*|*/dle-chip { color: teal; }\n.btn-busy-chip { color: orange; }\n.btn-error-chip { color: crimson; }\n`,
  );
  const scss = scssFixture.content;

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
    position: scssFixture.position,
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
  const buttonScssUri = "file:///fake/workspace/src/Button.module.scss";
  const baseScssUri = "file:///fake/workspace/src/Base.module.scss";
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
  const buttonScssFixture = fixture(
    buttonScssUri,
    `
.button {
  composes: b/*|*/ase from './Base.module.scss';
  color: red;
}
`,
  );
  const buttonScss = buttonScssFixture.content;
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
  await client.waitForDiagnostics(baseTsxUri);

  const result = await client.references({
    textDocument: { uri: buttonScssUri },
    position: buttonScssFixture.position,
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
  const scssFixture = fixture(
    scssUri,
    `@keyframes fa/*|*/de {
  from { opacity: 0; }
  to { opacity: 1; }
}

.box {
  animation: fade 1s linear;
}

.pulse {
  animation-name: fade;
}
`,
  );
  const scss = scssFixture.content;

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
    position: scssFixture.position,
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
  const scssFixture = fixture(
    scssUri,
    `@value pr/*|*/imary: #ff3355;

.button {
  color: primary;
}
`,
  );
  const scss = scssFixture.content;

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
    position: scssFixture.position,
    context: { includeDeclaration: true },
  });

  expect(result).not.toBeNull();
  expect(result).toHaveLength(2);
  expect(result!.every((location) => location.uri === scssUri)).toBe(true);
  expect(result!.some((location) => location.range.start.line === 0)).toBe(true);
  expect(result!.some((location) => location.range.start.line === 3)).toBe(true);
});

test("references protocol returns same-file Sass symbol references", async ({ makeClient }) => {
  const scssUri = "file:///fake/workspace/src/Button.module.scss";
  const scssFixture = fixture(
    scssUri,
    `$/*|*/gap: 1rem;
.button {
  color: $gap;
  margin: $gap;
}
`,
  );
  const scss = scssFixture.content;

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
    position: scssFixture.position,
    context: { includeDeclaration: true },
  });

  expect(result).not.toBeNull();
  expect(result).toHaveLength(3);
  expect(result!.every((location) => location.uri === scssUri)).toBe(true);
  expect(result!.map((location) => location.range.start.line)).toEqual([0, 2, 3]);
});

test("references protocol returns local import sites and source declaration for imported @value", async ({
  makeClient,
}) => {
  const scssUri = "file:///fake/workspace/src/Button.module.scss";
  const tokensUri = "file:///fake/workspace/src/tokens.module.scss";
  const scssFixture = fixture(
    scssUri,
    `@value primary from "./tokens.module.scss";

.button {
  color: p/*|*/rimary;
}
`,
  );
  const scss = scssFixture.content;
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
    position: scssFixture.position,
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
