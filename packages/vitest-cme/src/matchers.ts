import { expect } from "vitest";
import type { Range } from "./workspace";

type MatcherResult = {
  readonly pass: boolean;
  readonly message: () => string;
};

declare module "vitest" {
  interface Assertion<T = any> {
    toBeResolvedClass(expectedName?: string): T;
    toBeRenameTarget(expectedRange?: Range): T;
    toContainSelector(selectorName: string): T;
    toHaveCertainty(expected: string): T;
    toResolveTo(expected: unknown): T;
  }

  interface AsymmetricMatchersContaining {
    toBeResolvedClass(expectedName?: string): unknown;
    toBeRenameTarget(expectedRange?: Range): unknown;
    toContainSelector(selectorName: string): unknown;
    toHaveCertainty(expected: string): unknown;
    toResolveTo(expected: unknown): unknown;
  }
}

export function registerCmeMatchers(): void {
  expect.extend({
    toBeResolvedClass(received: unknown, expectedName?: string): MatcherResult {
      const actualName = extractName(received);
      const pass =
        actualName !== null && (expectedName === undefined || actualName === expectedName);
      return buildResult(pass, received, expectedName ?? "a resolved class");
    },
    toBeRenameTarget(received: unknown, expectedRange?: Range): MatcherResult {
      const range = readProperty(received, "range");
      const pass =
        isRange(range) && (expectedRange === undefined || rangesEqual(range, expectedRange));
      return buildResult(pass, received, expectedRange ?? "a rename target range");
    },
    toContainSelector(received: unknown, selectorName: string): MatcherResult {
      const selectors = Array.isArray(received) ? received : readProperty(received, "selectors");
      const pass =
        Array.isArray(selectors) &&
        selectors.some(
          (selector) => extractName(selector) === selectorName || selector === selectorName,
        );
      return buildResult(pass, received, `selector ${selectorName}`);
    },
    toHaveCertainty(received: unknown, expected: string): MatcherResult {
      const certainty =
        readProperty(received, "certainty") ??
        readProperty(received, "valueCertainty") ??
        readProperty(received, "selectorCertainty");
      const pass = certainty === expected;
      return buildResult(pass, received, `certainty ${expected}`);
    },
    toResolveTo(received: unknown, expected: unknown): MatcherResult {
      const actual =
        readProperty(received, "resolved") ??
        readProperty(received, "target") ??
        readProperty(received, "value") ??
        received;
      const pass = JSON.stringify(actual) === JSON.stringify(expected);
      return buildResult(pass, received, expected);
    },
  });
}

function extractName(value: unknown): string | null {
  if (typeof value === "string") return value;
  return (
    stringProperty(value, "canonicalName") ??
    stringProperty(value, "className") ??
    stringProperty(value, "name")
  );
}

function stringProperty(value: unknown, key: string): string | null {
  const property = readProperty(value, key);
  return typeof property === "string" ? property : null;
}

function readProperty(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function isRange(value: unknown): value is Range {
  if (typeof value !== "object" || value === null) return false;
  const start = readProperty(value, "start");
  const end = readProperty(value, "end");
  return isPosition(start) && isPosition(end);
}

function isPosition(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof readProperty(value, "line") === "number" &&
    typeof readProperty(value, "character") === "number"
  );
}

function rangesEqual(left: Range, right: Range): boolean {
  return (
    left.start.line === right.start.line &&
    left.start.character === right.start.character &&
    left.end.line === right.end.line &&
    left.end.character === right.end.character
  );
}

function buildResult(pass: boolean, received: unknown, expected: unknown): MatcherResult {
  return {
    pass,
    message: () =>
      pass
        ? `expected ${JSON.stringify(received)} not to match ${JSON.stringify(expected)}`
        : `expected ${JSON.stringify(received)} to match ${JSON.stringify(expected)}`,
  };
}
