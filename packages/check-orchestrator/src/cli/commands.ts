export function pnpmExecutable(platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? "pnpm.cmd" : "pnpm";
}
