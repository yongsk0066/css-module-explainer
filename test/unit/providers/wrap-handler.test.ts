import { describe, expect, it, vi } from "vitest";
import type { ProviderDeps } from "../../../server/lsp-server/src/providers/cursor-dispatch";
import { wrapHandler } from "../../../server/lsp-server/src/providers/_wrap-handler";
import { makeBaseDeps } from "../../_fixtures/test-helpers";

describe("wrapHandler", () => {
  it("returns the impl result when impl runs without error", () => {
    const deps = makeBaseDeps();
    const handler = wrapHandler<{ x: number }, [], number>(
      "testHandler",
      (params) => params.x * 2,
      -1,
    );
    expect(handler({ x: 3 }, deps)).toBe(6);
  });

  it("catches a sync throw and returns the fallback", () => {
    const logError = vi.fn();
    const deps: ProviderDeps = makeBaseDeps({ logError });
    const handler = wrapHandler<{ x: number }, [], string>(
      "testHandler",
      () => {
        throw new Error("boom");
      },
      "fallback-value",
    );
    const result = handler({ x: 1 }, deps);
    expect(result).toBe("fallback-value");
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it("logError is called with the handler name in the message", () => {
    const logError = vi.fn();
    const deps = makeBaseDeps({ logError });
    const handler = wrapHandler<unknown, [], null>(
      "myNamedHandler",
      () => {
        throw new Error("boom");
      },
      null,
    );
    handler({}, deps);
    expect(logError).toHaveBeenCalledWith("myNamedHandler handler failed", expect.any(Error));
  });

  it("preserves the error stack — logError receives the original Error value", () => {
    const logError = vi.fn();
    const deps = makeBaseDeps({ logError });
    const handler = wrapHandler<unknown, [], null>(
      "stackTest",
      () => {
        throw new Error("stack me");
      },
      null,
    );
    handler({}, deps);
    const [, err] = logError.mock.calls[0] ?? [];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).stack).toBeTruthy();
    expect((err as Error).message).toBe("stack me");
  });

  it("passes through additional positional arguments to impl", () => {
    const deps = makeBaseDeps();
    const spy = vi.fn((_p: { id: number }, _d: ProviderDeps, extra: string) => extra.toUpperCase());
    const handler = wrapHandler<{ id: number }, [extra: string], string>("passthrough", spy, "");
    const result = handler({ id: 1 }, deps, "hello");
    expect(result).toBe("HELLO");
    expect(spy).toHaveBeenCalledWith({ id: 1 }, deps, "hello");
  });

  it("returns an async impl result when impl resolves without error", async () => {
    const deps = makeBaseDeps();
    const handler = wrapHandler<{ x: number }, [], number>(
      "asyncHandler",
      async (params) => params.x * 3,
      -1,
    );
    await expect(handler({ x: 4 }, deps)).resolves.toBe(12);
  });

  it("catches an async rejection and resolves to the fallback", async () => {
    const logError = vi.fn();
    const deps = makeBaseDeps({ logError });
    const err = new Error("async boom");
    const handler = wrapHandler<unknown, [], string>(
      "asyncHandler",
      async () => {
        throw err;
      },
      "fallback",
    );
    await expect(handler({}, deps)).resolves.toBe("fallback");
    expect(logError).toHaveBeenCalledWith("asyncHandler handler failed", err);
  });
});
