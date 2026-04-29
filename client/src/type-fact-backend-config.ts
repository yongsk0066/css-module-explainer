export type ClientTypeFactBackendSetting = "tsgo" | "tsgo-workspace" | "typescript-current";

export function readClientTypeFactBackendSetting(value: unknown): ClientTypeFactBackendSetting {
  if (value === "tsgo" || value === "tsgo-workspace" || value === "typescript-current") {
    return value;
  }
  return "tsgo";
}

export function buildTypeFactBackendEnv(
  backend: ClientTypeFactBackendSetting,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const nextEnv = { ...baseEnv };
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
