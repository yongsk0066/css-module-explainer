import type {
  CheckerReportV1,
  EngineInputV1,
  EngineOutputV1,
} from "../../engine-core-ts/src/contracts";
import { buildEngineInputV1, type BuildEngineInputV1Options } from "./engine-input-v1";
import { buildEngineOutputV1 } from "./engine-output-v1";

export interface EngineParitySnapshotV1 {
  readonly input: EngineInputV1;
  readonly output: EngineOutputV1;
}

export interface BuildCheckerEngineParitySnapshotV1Options extends BuildEngineInputV1Options {
  readonly checkerReport: CheckerReportV1;
}

export function buildCheckerEngineParitySnapshotV1(
  options: BuildCheckerEngineParitySnapshotV1Options,
): EngineParitySnapshotV1 {
  return {
    input: buildEngineInputV1(options),
    output: buildEngineOutputV1({
      checkerReport: options.checkerReport,
    }),
  };
}
