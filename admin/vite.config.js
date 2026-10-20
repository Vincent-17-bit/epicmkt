import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", globals: true, css: false, include: ["src/**/*.ui.test.{js,jsx}"] },
  server: { port: 5175 },
  preview: { port: 4173 },
  build: { target: "esnext" },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
