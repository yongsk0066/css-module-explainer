import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      $scenarios: path.resolve(__dirname, "src/scenarios"),
    },
  },
  server: { port: 5174 },
});
