import { test, check } from "./support/kit.js";
import { origin } from "./support/env.js";

const tabs = [
  ["notifications", "Notifications"],
  ["questions", "Questions"],
  ["exceptions", "Exceptions"]
];

async function signIn(page) {
  await page.goto(origin("seller") + "/login");
  await page.locator("#sid").fill("ES100001");
  await page.locator("#pw").fill("Demo-Passw0rd");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("heading", { level: 1, name: "Subscription" }).waitFor();
}

test.describe("seller", () => {
  test("login", async ({ page }) => {
    await page.goto(origin("seller") + "/login");
    await check(page, "seller-login");
  });

  test("subscription", async ({ page }) => {
    await signIn(page);
    await check(page, "seller-subscription");
  });

  for (const [name, label] of tabs) {
    test(name, async ({ page }) => {
      await signIn(page);
      await page.getByRole("navigation", { name: "Business" }).getByRole("link", { name: label }).click();
      await page.waitForURL(`**/business/${name}`);
      await check(page, `seller-${name}`);
    });
  }
});
