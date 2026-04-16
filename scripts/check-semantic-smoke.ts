import { runCheckerCli } from "../server/src/core/checker";

const checks = [
  {
    label: "workspace-ci",
    argv: [".", "--preset", "ci", "--fail-on", "none"],
  },
  {
    label: "changed-source-shadowing",
    argv: [
      ".",
      "--preset",
      "changed-source",
      "--changed-file",
      "examples/src/scenarios/13-shadowing/ShadowingScenario.tsx",
      "--fail-on",
      "none",
    ],
  },
  {
    label: "changed-style-composes",
    argv: [
      ".",
      "--preset",
      "changed-style",
      "--changed-file",
      "examples/src/scenarios/15-composes/ComposesScenario.module.scss",
      "--fail-on",
      "none",
    ],
  },
] as const;

void (async () => {
  let exitCode = 0;

  for (const check of checks) {
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
