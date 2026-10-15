import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5175 },
  preview: { port: 4173 },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
    // CSS modules resolve to their plain class names so tests can read them; no styles are applied.
    css: { modules: { classNameStrategy: "non-scoped" } },
    include: ["src/**/*.test.{js,jsx}"],
  },
});
