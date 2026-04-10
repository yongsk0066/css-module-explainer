import type { ResolvedType } from "@css-module-explainer/shared";
import type { TypeResolver } from "../../server/src/core/ts/type-resolver.js";

/**
 * Shared test double for `TypeResolver`. Defaults to
 * `unresolvable`; pass an array of values to get a union.
 */
export class FakeTypeResolver implements TypeResolver {
  private readonly values: readonly string[];

  constructor(values: readonly string[] = []) {
    this.values = values;
  }

  resolve(): ResolvedType {
    return this.values.length > 0
      ? { kind: "union", values: this.values }
      : { kind: "unresolvable", values: [] };
  }

  invalidate(): void {}
  clear(): void {}
}
