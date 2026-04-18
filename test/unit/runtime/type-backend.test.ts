import { describe, expect, it } from "vitest";
import type { TypeResolver } from "../../../server/engine-core-ts/src/core/ts/type-resolver";
import {
  resolveTypeFactBackendKind,
  selectTypeResolver,
} from "../../../server/engine-host-node/src/type-backend";
import { TsgoPreviewTypeResolver } from "../../../server/engine-host-node/src/tsgo-preview-type-resolver";

describe("type backend selection", () => {
  it("defaults to typescript-current", () => {
    expect(resolveTypeFactBackendKind({})).toBe("typescript-current");
  });

  it("reads tsgo-preview from env", () => {
    expect(resolveTypeFactBackendKind({ CME_TYPE_FACT_BACKEND: "tsgo-preview" })).toBe(
      "tsgo-preview",
    );
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

  it("selects the preview resolver for tsgo-preview", () => {
    const selection = selectTypeResolver({
      typeBackend: "tsgo-preview",
    });

    expect(selection.backend).toBe("tsgo-preview");
    expect(selection.typeResolver).toBeInstanceOf(TsgoPreviewTypeResolver);
  });

  it("throws on unknown backend values", () => {
    expect(() =>
      resolveTypeFactBackendKind({
        CME_TYPE_FACT_BACKEND: "future-backend",
      } as NodeJS.ProcessEnv),
    ).toThrow("Unknown type fact backend: future-backend");
  });
});
