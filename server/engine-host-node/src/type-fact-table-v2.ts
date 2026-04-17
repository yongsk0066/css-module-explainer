import type { TypeFactTableV2 } from "../../engine-core-ts/src/contracts";
import { upcastTypeFactTableEntryV1ToV2 } from "../../engine-core-ts/src/contracts";
import { collectTypeFactTableV1, type CollectTypeFactTableV1Options } from "./type-fact-table-v1";

export function collectTypeFactTableV2(options: CollectTypeFactTableV1Options): TypeFactTableV2 {
  return collectTypeFactTableV1(options).map(upcastTypeFactTableEntryV1ToV2);
}
