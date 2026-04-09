import { describe, expect, it } from "vitest";
import { createDefaultProgram } from "../../server/src/composition-root.js";

describe("createDefaultProgram", () => {
  it("returns a program with an empty rootNames list when no tsconfig.json is found", () => {
    const program = createDefaultProgram("/nonexistent/path/that/has/no/tsconfig");
    expect(program.getRootFileNames()).toEqual([]);
  });
});
