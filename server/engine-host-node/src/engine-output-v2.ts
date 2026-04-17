import type {
  CheckerReportV1,
  EngineOutputV2,
  QueryResultV2,
} from "../../engine-core-ts/src/contracts";
import { ENGINE_CONTRACT_VERSION_V2 } from "../../engine-core-ts/src/contracts";
import type { TextRewritePlan } from "../../engine-core-ts/src/core/rewrite/text-rewrite-plan";

export interface BuildEngineOutputV2Options {
  readonly checkerReport: CheckerReportV1;
  readonly queryResults?: readonly QueryResultV2[];
  readonly rewritePlans?: readonly TextRewritePlan<unknown>[];
}

export function buildEngineOutputV2(options: BuildEngineOutputV2Options): EngineOutputV2 {
  return {
    version: ENGINE_CONTRACT_VERSION_V2,
    queryResults: options.queryResults ?? [],
    rewritePlans: options.rewritePlans ?? [],
    checkerReport: options.checkerReport,
  };
}
