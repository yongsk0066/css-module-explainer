import { expect, test } from "../_fixtures/protocol";
import { FakeTypeResolver } from "../_fixtures/fake-type-resolver";

test("SCSS code lens refreshes after TSX semantic references are analyzed", async ({
  makeClient,
}) => {
  const scssUri = "file:///fake/workspace/src/Some.module.scss";
  const tsxUri = "file:///fake/workspace/src/Some.tsx";
  const scss = `@use '$scss/utils' as *;

.something {
  @include heading1;
  display: flex;
}
`;
  const tsx = `import classNames from 'classnames/bind';

import styles from './Some.module.scss';
const cx = classNames.bind(styles);

export default function Some() {
  return (
    <div className={cx('something')}>
      Hello world
    </div>
  );
}
`;

  const client = makeClient({
    readStyleFile: (path) => (path.endsWith("Some.module.scss") ? scss : null),
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

  const initial = await client.codeLens({ textDocument: { uri: scssUri } });
  expect(initial).toBeNull();

  client.didOpen({
    textDocument: {
      uri: tsxUri,
      languageId: "typescriptreact",
      version: 1,
      text: tsx,
    },
  });
  await client.waitForDiagnostics(tsxUri);
  await client.waitForCodeLensRefresh();

  const refreshed = await client.codeLens({ textDocument: { uri: scssUri } });
  expect(refreshed).not.toBeNull();
  expect(refreshed).toHaveLength(1);
  expect(refreshed![0]!.command?.title).toBe("1 reference");
});
