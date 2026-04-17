import { runCheckerCli } from "../server/checker-cli/src";
import { RELEASE_BATCH_CORPUS } from "./release-batch-corpus";

const argv = [".", "--preset", "ci"] as string[];

for (const entry of RELEASE_BATCH_CORPUS) {
  argv.push(entry.kind === "source" ? "--source-file" : "--style-file", entry.path);
}

void (async () => {
  const exitCode = await runCheckerCli(argv, {
    stdout: (message) => process.stdout.write(message),
    stderr: (message) => process.stderr.write(message),
    cwd: () => process.cwd(),
  });
  process.exitCode = exitCode;
})();
