import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { target: "esnext" }, // api/index.js picks live or mock with top-level await
  server: { port: 5175 },
  preview: { port: 4173 },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
