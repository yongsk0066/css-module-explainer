import { runCheckerCli } from "../server/src/core/checker";
import { SEMANTIC_SMOKE_CORPUS } from "./semantic-smoke-corpus";

void (async () => {
  let exitCode = 0;

  for (const check of SEMANTIC_SMOKE_CORPUS) {
    process.stdout.write(`== ${check.label} ==\n`);
    // Sequential output is easier to read in release and CI logs than
    // interleaved parallel checker runs.
    // oxlint-disable-next-line eslint/no-await-in-loop
    const code = await runCheckerCli(check.argv, {
      stdout: (message) => process.stdout.write(message),
      stderr: (message) => process.stderr.write(message),
      cwd: () => process.cwd(),
    });
    if (code !== 0) exitCode = code;
    process.stdout.write("\n");
  }

  process.exitCode = exitCode;
})();
