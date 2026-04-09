import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/unit/**/*.test.ts", "test/protocol/**/*.test.ts"],
    environment: "node",
    globals: false,
    clearMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["shared/src/**", "server/src/**", "client/src/**"],
      exclude: ["**/dist/**", "**/*.d.ts", "**/node_modules/**"],
    },
  },
});
