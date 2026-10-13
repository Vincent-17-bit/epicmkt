import { existsSync } from "node:fs";
import { join } from "node:path";
import { test, check } from "./support/kit.js";
import { origin } from "./support/env.js";

const pages = [
  ["command-center", "/admin"],
  ["applications", "/admin/applications"],
  ["businesses", "/admin/businesses"],
  ["payments", "/admin/payments"],
  ["settings", "/admin/settings"],
  ["not-found", "/does-not-exist"]
];

const built = existsSync(join(process.cwd(), "admin", "dist", "index.html"));

test.describe("admin", () => {
  test.fixme(!built, "admin does not build yet: see docs/visual-regression.md");

  for (const [name, path] of pages) {
    test(name, async ({ page }) => {
      await page.goto(origin("admin") + path);
      await check(page, `admin-${name}`);
    });
  }
});
