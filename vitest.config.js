import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["server/tests/**/*.test.js", "client/src/**/*.test.jsx"],
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
