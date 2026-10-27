import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  root: "client",
  build: { outDir: "../dist", emptyOutDir: true },
  server: { proxy: { "/api": "http://127.0.0.1:4000" } },
  test: {
    include: ["server/tests/**/*.test.js", "client/src/**/*.test.jsx"],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
