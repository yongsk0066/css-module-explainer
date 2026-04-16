import { defineConfig } from "rolldown";

export default defineConfig([
  {
    input: { extension: "client/src/extension.ts" },
    tsconfig: "client/tsconfig.json",
    external: ["vscode"],
    platform: "node",
    output: {
      dir: "dist/client",
      format: "cjs",
      entryFileNames: "[name].js",
      sourcemap: "hidden",
      sourcemapExcludeSources: true,
      minify: true,
    },
  },
  {
    input: { server: "server/adapter-vscode/src/server.ts" },
    tsconfig: "server/adapter-vscode/tsconfig.json",
    platform: "node",
    output: {
      dir: "dist/server",
      format: "cjs",
      entryFileNames: "[name].js",
      sourcemap: "hidden",
      sourcemapExcludeSources: true,
      minify: true,
    },
  },
]);
