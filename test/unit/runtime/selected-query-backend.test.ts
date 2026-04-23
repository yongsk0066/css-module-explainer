import { describe, expect, it } from "vitest";
import {
  resolveSelectedQueryBackendKind,
  usesRustExpressionSemanticsBackend,
  usesRustSelectorUsageBackend,
  usesRustSourceResolutionBackend,
} from "../../../server/engine-host-node/src/selected-query-backend";

describe("selected query backend", () => {
  it("treats rust-selected-query as the unified Rust backend", () => {
    const kind = resolveSelectedQueryBackendKind({
      CME_SELECTED_QUERY_BACKEND: "rust-selected-query",
    } as NodeJS.ProcessEnv);

    expect(kind).toBe("rust-selected-query");
    expect(usesRustSourceResolutionBackend(kind)).toBe(true);
    expect(usesRustExpressionSemanticsBackend(kind)).toBe(true);
    expect(usesRustSelectorUsageBackend(kind)).toBe(true);
  });

  it("keeps individual Rust backend selectors narrow", () => {
    expect(usesRustSourceResolutionBackend("rust-source-resolution")).toBe(true);
    expect(usesRustExpressionSemanticsBackend("rust-source-resolution")).toBe(false);
    expect(usesRustSelectorUsageBackend("rust-source-resolution")).toBe(false);

    expect(usesRustSourceResolutionBackend("rust-expression-semantics")).toBe(false);
    expect(usesRustExpressionSemanticsBackend("rust-expression-semantics")).toBe(true);
    expect(usesRustSelectorUsageBackend("rust-expression-semantics")).toBe(false);

    expect(usesRustSourceResolutionBackend("rust-selector-usage")).toBe(false);
    expect(usesRustExpressionSemanticsBackend("rust-selector-usage")).toBe(false);
    expect(usesRustSelectorUsageBackend("rust-selector-usage")).toBe(true);
  });
});
