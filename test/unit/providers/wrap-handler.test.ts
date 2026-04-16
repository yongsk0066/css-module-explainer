import { describe, expect, it, vi } from "vitest";
import type { ProviderDeps } from "../../../server/adapter-vscode/src/providers/cursor-dispatch";
import { wrapHandler } from "../../../server/adapter-vscode/src/providers/_wrap-handler";
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

  // Documented intentional behavior: async rejection is NOT caught.
  // Async handlers must attach their own `.catch()` at the call site
  // so the error boundary is explicit, not implicit in a sync wrapper.
  it("does NOT swallow an async rejection — the rejected promise is returned as-is", async () => {
    const logError = vi.fn();
    const deps = makeBaseDeps({ logError });
    const handler = wrapHandler<unknown, [], Promise<string>>(
      "asyncHandler",
      () => Promise.reject(new Error("async boom")),
      Promise.resolve("fallback"),
    );
    const result = handler({}, deps);
    await expect(result).rejects.toThrow("async boom");
    // sync wrapHandler did not see the rejection, so logError was never invoked.
    expect(logError).not.toHaveBeenCalled();
  });
});
