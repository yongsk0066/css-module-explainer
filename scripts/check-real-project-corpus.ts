import { runCheckerCli } from "../server/checker-cli/src";
import { REAL_PROJECT_CORPUS } from "./real-project-corpus";

void (async () => {
  let exitCode = 0;

  for (const entry of REAL_PROJECT_CORPUS) {
    process.stdout.write(`== ${entry.label} ==\n`);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const code = await runCheckerCli(entry.argv, {
      stdout: (message) => process.stdout.write(message),
      stderr: (message) => process.stderr.write(message),
      cwd: () => process.cwd(),
    });
    if (code !== 0) exitCode = code;
    process.stdout.write("\n");
  }

  process.exitCode = exitCode;
})();
