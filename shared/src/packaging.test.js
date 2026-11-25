import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// scales/index.js fills the scale registry when it is imported. If the package says "no side effects", a bundler drops that import
// whenever an app only calls getScale, the registry stays empty and the seller app dies on its first screen with a blank page.
test("the scale registry file is declared as having side effects", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.ok(Array.isArray(pkg.sideEffects), "sideEffects must list the files that register things");
  assert.ok(pkg.sideEffects.includes("./src/scales/index.js"));
});
