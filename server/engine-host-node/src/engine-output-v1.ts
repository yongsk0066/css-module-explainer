import type {
  CheckerReportV1,
  EngineOutputV1,
  QueryResultV1,
} from "../../engine-core-ts/src/contracts";
import { ENGINE_CONTRACT_VERSION_V1 } from "../../engine-core-ts/src/contracts";
import type { TextRewritePlan } from "../../engine-core-ts/src/core/rewrite/text-rewrite-plan";

export interface BuildEngineOutputV1Options {
  readonly checkerReport: CheckerReportV1;
  readonly queryResults?: readonly QueryResultV1[];
  readonly rewritePlans?: readonly TextRewritePlan<unknown>[];
}

export function buildEngineOutputV1(options: BuildEngineOutputV1Options): EngineOutputV1 {
  return {
    version: ENGINE_CONTRACT_VERSION_V1,
    queryResults: options.queryResults ?? [],
    rewritePlans: options.rewritePlans ?? [],
    checkerReport: options.checkerReport,
  };
}
