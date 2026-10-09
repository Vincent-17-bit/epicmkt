import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js", "shared/**/*.test.js", "supabase/**/*.test.ts"],
    exclude: [...configDefaults.exclude],
    testTimeout: 180000,
    hookTimeout: 180000
  }
});
