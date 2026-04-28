import type { ProviderDeps } from "./provider-deps";

/**
 * Positional-contract error boundary for provider handlers.
 *
 * Every LSP handler follows the same shape — `(params, deps, ...rest)` —
 * so `wrapHandler` captures sync exceptions and async rejections
 * from `impl`, routes them through `deps.logError`, and returns
 * `fallback`. This keeps the provider boundary uniform while the
 * implementation underneath may stay sync or move to a long-lived
 * async backend.
 *
 * Stack preservation: `logError` receives the original `err` value,
 * so its downstream formatter (the composition-root wires
 * `err instanceof Error ? err.stack : String(err)`) can render the
 * full stack.
 */
export function wrapHandler<P, Rest extends readonly unknown[], R>(
  name: string,
  impl: (params: P, deps: ProviderDeps, ...rest: Rest) => MaybePromise<R>,
  fallback: R,
): (params: P, deps: ProviderDeps, ...rest: Rest) => MaybePromise<R> {
  return (params, deps, ...rest) => {
    try {
      const result = impl(params, deps, ...rest);
      if (isPromiseLike(result)) {
        return Promise.resolve(result).catch((err: unknown) => {
          deps.logError(`${name} handler failed`, err);
          return fallback;
        });
      }
      return result;
    } catch (err) {
      deps.logError(`${name} handler failed`, err);
      return fallback;
    }
  };
}

type MaybePromise<T> = T | PromiseLike<T>;

function isPromiseLike<T>(value: MaybePromise<T>): value is PromiseLike<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}
