import react from "@vitejs/plugin-react-oxc";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
});
