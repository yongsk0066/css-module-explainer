import { runCheckerCli } from "../server/checker-cli/src";

void (async () => {
  const exitCode = await runCheckerCli(process.argv.slice(2));
  process.exitCode = exitCode;
})();
