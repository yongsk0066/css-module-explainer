import { describe, expect, it } from "vitest";
import type { TypeResolver } from "../../../server/engine-core-ts/src/core/ts/type-resolver";
import {
  resolveTypeFactBackendKind,
  selectTypeResolver,
} from "../../../server/engine-host-node/src/type-backend";
import { TsgoProbeTypeResolver } from "../../../server/engine-host-node/src/tsgo-probe-type-resolver";

describe("type backend selection", () => {
  it("defaults to typescript-current", () => {
    expect(resolveTypeFactBackendKind({})).toBe("typescript-current");
  });

  it("reads tsgo from env", () => {
    expect(resolveTypeFactBackendKind({ CME_TYPE_FACT_BACKEND: "tsgo" })).toBe("tsgo");
  });

  it("normalizes tsgo-preview from env", () => {
    expect(resolveTypeFactBackendKind({ CME_TYPE_FACT_BACKEND: "tsgo-preview" })).toBe("tsgo");
  });

  it("prefers explicit backend over env", () => {
    const fakeResolver: TypeResolver = {
      resolve() {
        return { kind: "unresolvable", values: [] };
      },
      invalidate() {},
      clear() {},
    };

    const selection = selectTypeResolver({
      typeBackend: "typescript-current",
      env: { CME_TYPE_FACT_BACKEND: "tsgo-preview" },
      typeResolver: fakeResolver,
    });

    expect(selection.backend).toBe("typescript-current");
    expect(selection.typeResolver).toBe(fakeResolver);
  });

  it("selects the probe resolver for tsgo", () => {
    const selection = selectTypeResolver({
      typeBackend: "tsgo",
    });

    expect(selection.backend).toBe("tsgo");
    expect(selection.typeResolver).toBeInstanceOf(TsgoProbeTypeResolver);
  });

  it("throws on unknown backend values", () => {
    expect(() =>
      resolveTypeFactBackendKind({
        CME_TYPE_FACT_BACKEND: "future-backend",
      } as NodeJS.ProcessEnv),
    ).toThrow("Unknown type fact backend: future-backend");
  });
});
