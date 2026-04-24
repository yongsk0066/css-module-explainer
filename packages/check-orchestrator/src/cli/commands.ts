export interface PnpmRunCommand {
  readonly executable: string;
  readonly args: readonly string[];
  readonly display: readonly string[];
}

interface PnpmRunCommandOptions {
  readonly platform?: NodeJS.Platform;
  readonly env?: NodeJS.ProcessEnv;
  readonly nodeExecutable?: string;
}

export function pnpmRunCommand(
  scriptName: string,
  extraArgs: readonly string[] = [],
  options: PnpmRunCommandOptions = {},
): PnpmRunCommand {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const nodeExecutable = options.nodeExecutable ?? process.execPath;
  const pnpmArgs = ["run", scriptName, ...(extraArgs.length > 0 ? ["--", ...extraArgs] : [])];
  const display = ["pnpm", ...pnpmArgs];

  if (env.npm_execpath) {
    return {
      executable: nodeExecutable,
      args: [env.npm_execpath, ...pnpmArgs],
      display,
    };
  }

  if (platform === "win32") {
    return {
      executable: env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", "pnpm", ...pnpmArgs],
      display,
    };
  }

  return {
    executable: "pnpm",
    args: pnpmArgs,
    display,
  };
}
