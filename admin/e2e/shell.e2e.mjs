// Step B1b browser checks, run against a built admin app in mock mode.
//
//   npm run build -w admin && npx vite preview --port 4173 --strictPort   (in admin/)
//   ADMIN_URL=http://localhost:4173 node admin/e2e/shell.e2e.mjs
//
// Needs `playwright-core` and a Chromium. Set CHROMIUM_PATH to use your own; otherwise Playwright's default is used.
import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const BASE = process.env.ADMIN_URL ?? "http://localhost:4173";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: process.env.CHROMIUM_ARGS?.split(" ") ?? [] });
let failed = 0;
const pageErrors = [];

async function check(name, fn) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(`${name}: ${e.message}`));
  try { await fn(page, context); console.log("ok   ", name); }
  catch (error) { failed += 1; console.log("FAIL ", name, "\n     ", error.message.split("\n")[0]); await page.screenshot({ path: `/tmp/fail-${name.replace(/\W+/g, "-")}.png` }).catch(() => {}); }
  finally { await context.close(); }
}

async function signIn(page, email = "owner@epicmkt.test", path = "/admin") {
  await page.goto(BASE + path);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
async function through(page, email, path) {
  await signIn(page, email, path);
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: /Verify|Turn on/ }).click();
  await page.locator("header h1").waitFor();
}
const noHScroll = (page) => page.evaluate(() => {
  const els = [document.documentElement, document.body, document.querySelector("#root"), document.querySelector(".content"), document.querySelector(".auth-page")].filter(Boolean);
  return els.every((el) => el.scrollWidth <= el.clientWidth + 0);
});

await check("sign in, enrol, land on the deep link", async (page) => {
  await signIn(page, "owner@epicmkt.test", "/admin/payments");
  await page.getByRole("heading", { name: "Set up your authenticator" }).waitFor();
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: /Turn on/ }).click();
  await page.getByText("That code did not work").waitFor();
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: /Turn on/ }).click();
  await page.locator("header h1", { hasText: "Payments" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/admin/payments");
});

await check("bad password shows one generic message", async (page) => {
  await page.goto(BASE + "/admin");
  await page.getByLabel("Email").fill("owner@epicmkt.test");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByText("That email and password do not match.").waitFor();
});

await check("sign out, sign in again goes to the challenge, not enrolment", async (page) => {
  await through(page, "reviewer@epicmkt.test");
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await signIn(page, "reviewer@epicmkt.test");
  await page.getByRole("heading", { name: "Enter your code" }).waitFor();
});

await check("a non-admin lands on 'No access' and never sees MFA", async (page) => {
  await signIn(page, "stranger@epicmkt.test");
  await page.getByRole("heading", { name: "No access" }).waitFor();
  assert.equal(await page.getByText("Set up your authenticator").count(), 0);
});

await check("finance: Settings and Applications are hidden, a typed URL explains why", async (page) => {
  await through(page, "finance@epicmkt.test");
  const nav = page.locator(".sidebar nav");
  assert.equal(await nav.getByText("Settings").count(), 0);
  assert.equal(await nav.getByText("Applications").count(), 0);
  await nav.getByText("Payments").waitFor();
  await page.goto(BASE + "/admin/settings");
  await page.getByText("You do not have access to this page").waitFor();
  await page.getByText("Only Owners can open settings. You are signed in as Finance.").waitFor();
});

await check("owner sees every page; support does not see Applications", async (page, context) => {
  await through(page, "owner@epicmkt.test");
  assert.ok((await page.locator(".sidebar .nav-item").count()) >= 9);
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await through(page, "support@epicmkt.test");
  assert.equal(await page.locator(".sidebar nav").getByText("Applications").count(), 0);
  await page.locator(".sidebar nav").getByText("Flags and reports").waitFor();
});

await check("sidebar is 272px, collapses to 80px with the chevron and with '['", async (page) => {
  await through(page, "owner@epicmkt.test");
  const width = () => page.locator(".sidebar").evaluate((el) => Math.round(el.getBoundingClientRect().width));
  assert.equal(await width(), 272);
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.waitForFunction(() => Math.round(document.querySelector(".sidebar").getBoundingClientRect().width) === 80);
  await page.keyboard.press("[");
  await page.waitForFunction(() => Math.round(document.querySelector(".sidebar").getBoundingClientRect().width) === 272);
  await page.getByRole("button", { name: "Collapse sidebar" }).focus();
  await page.locator(".header .search input").focus();
  await page.keyboard.type("[");
  assert.equal(await width(), 272, "typing '[' in a field must not toggle");
});

await check("sidebar badges come from the counts", async (page) => {
  await through(page, "owner@epicmkt.test");
  const text = async (name) => (await page.locator(".sidebar .nav-item", { hasText: name }).locator(".nav-badge [aria-hidden]").first().innerText()).trim();
  assert.equal(await text("Applications"), "4");
  assert.equal(await text("Payments"), "8");
  assert.equal(await text("Messages"), "19");
  assert.equal(await text("Businesses"), "8"); // expiring 6 + in grace 2
});

await check("header: title, breadcrumb, search, bell, EAT clock, avatar menu with theme toggle", async (page) => {
  await through(page, "owner@epicmkt.test", "/admin/payments");
  const header = page.locator("header.header");
  assert.equal(await header.getByRole("button", { name: "Open menu" }).isVisible(), false, "no hamburger on desktop");
  assert.equal(await header.getByRole("button", { name: "Open search" }).isVisible(), false, "no search icon on desktop");
  await header.getByRole("navigation", { name: "Breadcrumb" }).getByText("Money").waitFor();
  await header.getByRole("search").waitFor();
  assert.match(await header.locator(".eat-clock").innerText(), /^\d\d:\d\d\s+EAT$/);
  await header.getByRole("button", { name: /Notifications/ }).click();
  await page.getByText("Needs attention").waitFor();
  await page.keyboard.press("Escape");
  await header.getByRole("button", { name: /Account menu/ }).click();
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.getByRole("switch", { name: "Dark theme" }).click();
  assert.notEqual(await page.evaluate(() => document.documentElement.dataset.theme), before);
});

await check("header stays visible while the content scrolls", async (page) => {
  await through(page, "owner@epicmkt.test");
  await page.evaluate(() => { const d = document.createElement("div"); d.style.height = "4000px"; document.querySelector(".content").append(d); });
  await page.locator(".content").evaluate((el) => { el.scrollTop = 1500; });
  assert.ok((await page.locator(".content").evaluate((el) => el.scrollTop)) > 1000);
  const box = await page.locator("header.header").boundingBox();
  assert.equal(Math.round(box.y), 0);
  assert.ok(await page.locator("header.header h1").isVisible());
});

await check("phone: drawer and bottom bar", async (page) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await through(page, "owner@epicmkt.test");
  assert.equal(await page.locator(".sidebar").isVisible(), false);
  assert.equal(await page.locator(".bottom-bar .bottom-bar__item").count(), 5); // four pages and More
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("dialog", { name: "Menu" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Menu" }).waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Open menu");
  await page.locator(".bottom-bar").getByText("More").click();
  await page.getByRole("dialog", { name: "Menu" }).getByText("Audit log").click();
  await page.locator("header h1", { hasText: "Audit log" }).waitFor();
  assert.equal(await page.getByRole("dialog", { name: "Menu" }).count(), 0, "drawer closes on navigation");
});

await check("security page: sessions list and 'sign out other devices'", async (page) => {
  await through(page, "owner@epicmkt.test", "/admin/security");
  await page.getByText("This device").waitFor();
  assert.equal(await page.locator(".session").count(), 3);
  await page.getByRole("button", { name: "Sign out other devices" }).click();
  await page.getByRole("button", { name: "Yes, sign them out" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".session").length === 1);
});

await check("idle: warning, then sign-out, and 'Stay signed in' resets", async (page) => {
  await page.clock.install();
  await through(page, "owner@epicmkt.test");
  await page.clock.fastForward(13 * 60_000 + 2000);
  await page.getByRole("alertdialog", { name: "Still there?" }).waitFor();
  await page.mouse.move(10, 10); // a stray move must not dismiss it
  assert.equal(await page.getByRole("alertdialog").count(), 1);
  await page.getByRole("button", { name: "Stay signed in" }).click();
  assert.equal(await page.getByRole("alertdialog").count(), 0);
  await page.clock.fastForward(15 * 60_000 + 2000);
  await page.getByText("You were signed out after 15 minutes without activity.").waitFor();
});

await check("no horizontal scroll from 320px to 1920px, signed out and in", async (page) => {
  const widths = [320, 360, 375, 414, 600, 767, 768, 900, 1024, 1099, 1100, 1280, 1440, 1920];
  for (const w of widths) { await page.setViewportSize({ width: w, height: 800 }); await page.goto(BASE + "/admin"); await page.getByText("Sign in").first().waitFor(); assert.ok(await noHScroll(page), `sign-in at ${w}px`); }
  await page.setViewportSize({ width: 1280, height: 800 });
  await through(page, "owner@epicmkt.test");
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 800 });
    for (const path of ["/admin", "/admin/payments", "/admin/security", "/admin/nope"]) {
      await page.goto(BASE + path); await page.locator("header h1").waitFor();
      assert.ok(await noHScroll(page), `${path} at ${w}px`);
      const h = await page.evaluate(() => Math.round(document.querySelector("header.header").getBoundingClientRect().right));
      assert.ok(h <= w, `header fits at ${w}px (right edge ${h})`);
    }
  }
});

await check("no horizontal scroll with popovers, search row and drawer open at 320px", async (page) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await through(page, "owner@epicmkt.test", "/admin/security");
  await page.getByRole("button", { name: "Open search" }).click();
  assert.ok(await noHScroll(page));
  await page.getByRole("button", { name: /Notifications/ }).click();
  assert.ok(await noHScroll(page));
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Account menu/ }).click();
  assert.ok(await noHScroll(page));
  const r = await page.locator("#account-panel").boundingBox();
  assert.ok(r.x >= 0 && r.x + r.width <= 320, "account panel inside the screen");
});

await browser.close();
if (pageErrors.length) { console.log("page errors:", pageErrors); failed += 1; }
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
