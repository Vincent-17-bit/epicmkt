import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js", "shared/**/*.test.js", "supabase/**/*.test.ts"],
    testTimeout: 180000,
    hookTimeout: 180000
  }
});
