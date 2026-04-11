import { describe, it, expect } from "vitest";
import { isInsideCall } from "../../../server/src/providers/completion";

describe("isInsideCall", () => {
  it("returns true when the last cx( is still open on the line", () => {
    expect(isInsideCall("const x = cx('abc", "cx")).toBe(true);
  });

  it("returns false when the cx call is already closed", () => {
    expect(isInsideCall("const x = cx('abc')", "cx")).toBe(false);
  });

  it("returns false when there is no cx call on the line", () => {
    expect(isInsideCall("const x = 1", "cx")).toBe(false);
  });

  it("handles nested parens correctly", () => {
    expect(isInsideCall("cx(isActive && 'on'", "cx")).toBe(true);
    expect(isInsideCall("cx(isActive && 'on')", "cx")).toBe(false);
  });

  it("handles an object literal inside the call", () => {
    expect(isInsideCall("cx({ active", "cx")).toBe(true);
    expect(isInsideCall("cx({ active: true", "cx")).toBe(true);
    expect(isInsideCall("cx({ active: true })", "cx")).toBe(false);
  });

  it("ignores a cx call from earlier on the same line", () => {
    expect(isInsideCall("const a = cx('b'); const c = cx('d", "cx")).toBe(true);
  });

  it("respects custom variable names", () => {
    expect(isInsideCall("const x = classes('abc", "classes")).toBe(true);
    expect(isInsideCall("const x = cx('abc", "classes")).toBe(false);
  });
});
