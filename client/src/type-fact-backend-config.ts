export type ClientTypeFactBackendSetting = "tsgo" | "tsgo-workspace";

export function readClientTypeFactBackendSetting(value: unknown): ClientTypeFactBackendSetting {
  if (value === "tsgo" || value === "tsgo-workspace") {
    return value;
  }
  return "tsgo";
}

export function buildTypeFactBackendEnv(
  backend: ClientTypeFactBackendSetting,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const nextEnv = { ...baseEnv };

  nextEnv.CME_TYPE_FACT_BACKEND = "tsgo";
  if (backend === "tsgo-workspace") {
    nextEnv.CME_TSGO_RESOLUTION = "workspace";
  } else if (nextEnv.CME_TSGO_RESOLUTION === "workspace") {
    delete nextEnv.CME_TSGO_RESOLUTION;
  }
  return nextEnv;
}
