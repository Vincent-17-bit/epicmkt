import { test, check } from "./support/kit.js";
import { origin } from "./support/env.js";

const pages = [
  ["home", "/"],
  ["search", "/search?q=gym"],
  ["business", "/b/ironcore-gym"],
  ["flash", "/flash"],
  ["offers", "/offers"],
  ["contact", "/contact"],
  ["sell", "/sell"],
  ["become-a-seller", "/become-a-seller"],
  ["not-found", "/does-not-exist"]
];

test.describe("client", () => {
  for (const [name, path] of pages) {
    test(name, async ({ page }) => {
      await page.goto(origin("client") + path);
      await check(page, `client-${name}`);
    });
  }

  test("menu open", async ({ page }) => {
    await page.goto(origin("client") + "/");
    await page.getByRole("button", { name: "Open menu" }).click();
    await check(page, "client-menu-open", { full: false });
  });
});
