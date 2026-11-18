import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
    // The item editor is a large form (every step, the live preview and the checklist render at once), and the end-to-end editor tests
    // type into many fields. 5 s was right at the edge on a fast machine; CI machines are slower.
    testTimeout: 15000,
    include: ["src/**/*.test.jsx"],
    css: { include: [/.+/], modules: { classNameStrategy: "non-scoped" } }
  }
});
