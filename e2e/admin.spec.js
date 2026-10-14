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

test.describe("admin", () => {
  for (const [name, path] of pages) {
    test(name, async ({ page }) => {
      await page.goto(origin("admin") + path);
      await check(page, `admin-${name}`);
    });
  }
});
