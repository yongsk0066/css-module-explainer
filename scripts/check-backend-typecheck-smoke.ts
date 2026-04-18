import path from "node:path";
import { spawnSync } from "node:child_process";

type BackendTypecheckVariant = "typescript-current" | "tsgo-preview";

const variant = readVariant();
const fixtureTsconfig = path.resolve(
  process.cwd(),
  "test/_fixtures/backend-typecheck-smoke/tsconfig.json",
);

const child = spawnSync("pnpm", commandForVariant(variant, fixtureTsconfig), {
  cwd: process.cwd(),
  stdio: "inherit",
  env: process.env,
});

process.exit(child.status ?? 1);

function readVariant(): BackendTypecheckVariant {
  const value = process.env.CME_TYPECHECK_VARIANT ?? "typescript-current";
  if (value === "typescript-current" || value === "tsgo-preview") {
    return value;
  }

  throw new Error(`Unknown backend typecheck variant: ${value}`);
}

function commandForVariant(
  selectedVariant: BackendTypecheckVariant,
  tsconfigPath: string,
): readonly string[] {
  if (selectedVariant === "tsgo-preview") {
    return [
      "dlx",
      "@typescript/native-preview",
      "-p",
      tsconfigPath,
      "--pretty",
      "false",
      "--noEmit",
    ];
  }

  return ["exec", "tsc", "-p", tsconfigPath, "--pretty", "false", "--noEmit"];
}
