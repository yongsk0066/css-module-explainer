import { describe, expect, it } from "vitest";
import {
  buildTypeFactBackendEnv,
  readClientTypeFactBackendSetting,
  readTypeFactMaxSyncProgramFilesSetting,
} from "../../../client/src/type-fact-backend-config";

describe("client type-fact backend config", () => {
  it("defaults invalid setting values to bundled tsgo", () => {
    expect(readClientTypeFactBackendSetting("future")).toBe("tsgo");
    expect(readClientTypeFactBackendSetting(undefined)).toBe("tsgo");
  });

  it("maps bundled tsgo to the server env without workspace resolution", () => {
    expect(
      buildTypeFactBackendEnv("tsgo", {
        CME_TSGO_RESOLUTION: "workspace",
      }),
    ).toMatchObject({
      CME_TYPE_FACT_BACKEND: "tsgo",
    });
    expect(
      buildTypeFactBackendEnv("tsgo", { CME_TSGO_RESOLUTION: "workspace" }),
    ).not.toHaveProperty("CME_TSGO_RESOLUTION");
  });

  it("maps the sync TypeScript program budget to server env", () => {
    expect(buildTypeFactBackendEnv("tsgo", {}, { maxSyncProgramFiles: 250 })).toMatchObject({
      CME_TYPE_FACT_BACKEND: "tsgo",
      CME_TYPE_FACT_MAX_SYNC_PROGRAM_FILES: "250",
    });
  });

  it("normalizes the sync TypeScript program budget setting", () => {
    expect(readTypeFactMaxSyncProgramFilesSetting(250.8)).toBe(250);
    expect(readTypeFactMaxSyncProgramFilesSetting(0)).toBe(0);
    expect(readTypeFactMaxSyncProgramFilesSetting("bad")).toBe(500);
  });

  it("keeps workspace tsgo as an explicit power-user mode", () => {
    expect(buildTypeFactBackendEnv("tsgo-workspace", {})).toMatchObject({
      CME_TYPE_FACT_BACKEND: "tsgo",
      CME_TSGO_RESOLUTION: "workspace",
    });
  });

  it("maps the current TypeScript backend to an explicit server env", () => {
    expect(
      buildTypeFactBackendEnv("typescript-current", { CME_TSGO_RESOLUTION: "workspace" }),
    ).toEqual({
      CME_TYPE_FACT_BACKEND: "typescript-current",
    });
  });
});
