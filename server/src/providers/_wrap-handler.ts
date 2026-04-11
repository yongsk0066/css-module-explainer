import type { ProviderDeps } from "./cursor-dispatch";

/**
 * Positional-contract error boundary for provider handlers.
 *
 * Every LSP handler follows the same shape — `(params, deps, ...rest)` —
 * so `wrapHandler` captures sync exceptions from `impl`, routes them
 * through `deps.logError`, and returns `fallback`. Async rejections
 * are NOT caught: if `impl` returns a rejected promise, the wrapper
 * passes it through untouched. This is intentional — async handlers
 * attach their own error boundary via `.catch()` to keep the contract
 * explicit at the async call site.
 *
 * Stack preservation: `logError` receives the original `err` value,
 * so its downstream formatter (the composition-root wires
 * `err instanceof Error ? err.stack : String(err)`) can render the
 * full stack.
 */
export function wrapHandler<P, Rest extends readonly unknown[], R>(
  name: string,
  impl: (params: P, deps: ProviderDeps, ...rest: Rest) => R,
  fallback: R,
): (params: P, deps: ProviderDeps, ...rest: Rest) => R {
  return (params, deps, ...rest) => {
    try {
      return impl(params, deps, ...rest);
    } catch (err) {
      deps.logError(`${name} handler failed`, err);
      return fallback;
    }
  };
}
