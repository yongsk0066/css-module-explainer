import { runCheckerCli } from "../server/src/checker-cli";

void (async () => {
  const exitCode = await runCheckerCli(process.argv.slice(2));
  process.exitCode = exitCode;
})();
