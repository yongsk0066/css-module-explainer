import type { RustSelectedQueryBackendJsonRunnerAsync } from "../../../engine-host-node/src/selected-query-backend";
import type { ProviderDeps } from "./provider-deps";

type ProviderDepsWithRustSelectedQueryRunner = ProviderDeps & {
  readonly runRustSelectedQueryBackendJsonAsync?: RustSelectedQueryBackendJsonRunnerAsync;
};

export function getRustSelectedQueryBackendJsonRunnerAsync(
  deps: ProviderDeps,
): RustSelectedQueryBackendJsonRunnerAsync | undefined {
  return (deps as ProviderDepsWithRustSelectedQueryRunner).runRustSelectedQueryBackendJsonAsync;
}
