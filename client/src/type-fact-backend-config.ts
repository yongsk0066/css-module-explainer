export type ClientTypeFactBackendSetting = "tsgo" | "tsgo-workspace" | "typescript-current";

export const DEFAULT_TYPE_FACT_MAX_SYNC_PROGRAM_FILES = 500;

export function readClientTypeFactBackendSetting(value: unknown): ClientTypeFactBackendSetting {
  if (value === "tsgo" || value === "tsgo-workspace" || value === "typescript-current") {
    return value;
  }
  return "tsgo";
}

export function readTypeFactMaxSyncProgramFilesSetting(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return DEFAULT_TYPE_FACT_MAX_SYNC_PROGRAM_FILES;
  }
  return Math.floor(value);
}

export function buildTypeFactBackendEnv(
  backend: ClientTypeFactBackendSetting,
  baseEnv: NodeJS.ProcessEnv = process.env,
  options: { readonly maxSyncProgramFiles?: number } = {},
): NodeJS.ProcessEnv {
  const nextEnv = { ...baseEnv };
  if (options.maxSyncProgramFiles !== undefined) {
    nextEnv.CME_TYPE_FACT_MAX_SYNC_PROGRAM_FILES = String(options.maxSyncProgramFiles);
  }
  if (backend === "typescript-current") {
    nextEnv.CME_TYPE_FACT_BACKEND = "typescript-current";
    delete nextEnv.CME_TSGO_RESOLUTION;
    return nextEnv;
  }

  nextEnv.CME_TYPE_FACT_BACKEND = "tsgo";
  if (backend === "tsgo-workspace") {
    nextEnv.CME_TSGO_RESOLUTION = "workspace";
  } else if (nextEnv.CME_TSGO_RESOLUTION === "workspace") {
    delete nextEnv.CME_TSGO_RESOLUTION;
  }
  return nextEnv;
}
