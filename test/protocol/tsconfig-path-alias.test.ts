import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { expect, test } from "../_fixtures/protocol";

test("tsconfig paths aliases resolve CSS Module imports across definition and codeLens", async ({
  makeClient,
}) => {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "cme-ts-path-"));
  const tsxUri = "file:///fake/workspace/src/Some.tsx";
  const scssUri = "file:///fake/workspace/src/components/Some.module.scss";
  const tsx = `import classNames from 'classnames/bind';
import styles from '$components/Some.module.scss';
const cx = classNames.bind(styles);
export default function Some() {
  return <div className={cx('something')}>Hello world</div>;
}
`;
  const scss = `.something {\n  display: flex;\n}\n`;

  fs.mkdirSync(path.join(workspacePath, "src/components"), { recursive: true });
  fs.writeFileSync(
    path.join(workspacePath, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "$components/*": ["src/components/*"],
          },
        },
      },
      null,
      2,
    ),
  );

  try {
    const client = makeClient({ workspacePath });
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
    client.didOpen({
      textDocument: {
        uri: tsxUri,
        languageId: "typescriptreact",
        version: 1,
        text: tsx,
      },
    });
    await client.waitForDiagnostics(tsxUri);

    const definition = await client.definition({
      textDocument: { uri: tsxUri },
      position: { line: 4, character: 29 },
    });
    expect(definition).not.toBeNull();
    expect(definition).toHaveLength(1);
    const first = definition![0]!;
    expect("targetUri" in first ? first.targetUri : first.uri).toBe(scssUri);

    const lenses = await client.codeLens({
      textDocument: { uri: scssUri },
    });
    expect(lenses).not.toBeNull();
    expect(lenses).toHaveLength(1);
    expect(lenses![0]!.command?.title).toBe("1 reference");
  } finally {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
});
