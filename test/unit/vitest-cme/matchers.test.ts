import { describe, expect, it } from "vitest";
import { registerCmeMatchers } from "../../../packages/vitest-cme/src";

registerCmeMatchers();

describe("vitest-cme matchers", () => {
  it("matches resolved class payloads", () => {
    expect({ canonicalName: "root" }).toBeResolvedClass("root");
    expect({ className: "active" }).toBeResolvedClass("active");
  });

  it("matches rename target ranges", () => {
    const range = {
      start: { line: 1, character: 2 },
      end: { line: 1, character: 8 },
    };

    expect({ range }).toBeRenameTarget(range);
  });

  it("matches selector collections", () => {
    expect({ selectors: [{ name: "root" }, { canonicalName: "active" }] }).toContainSelector(
      "active",
    );
  });

  it("matches certainty fields", () => {
    expect({ valueCertainty: "exact" }).toHaveCertainty("exact");
    expect({ selectorCertainty: "expanded" }).toHaveCertainty("expanded");
  });

  it("matches generic resolved targets", () => {
    expect({ resolved: { filePath: "Button.module.scss", name: "root" } }).toResolveTo({
      filePath: "Button.module.scss",
      name: "root",
    });
  });
});
