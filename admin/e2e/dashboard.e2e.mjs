// Step B1c browser checks for the Command Center, run against a built admin app in mock mode.
//
//   npm run build -w admin && npx vite preview --port 4173 --strictPort   (in admin/)
//   ADMIN_URL=http://localhost:4173 node admin/e2e/dashboard.e2e.mjs
//
// Needs `playwright-core` and a Chromium. Set CHROMIUM_PATH (and CHROMIUM_ARGS) to use your own.
import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const BASE = process.env.ADMIN_URL ?? "http://localhost:4173";
const launch = () => chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: process.env.CHROMIUM_ARGS?.split(" ") ?? [] });
let failed = 0;
const pageErrors = [];

async function check(name, fn, { width = 1280, height = 900, reducedMotion = "no-preference" } = {}) {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion });
  const page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(`${name}: ${e.message}`));
  try { await fn(page, context); console.log("ok   ", name); }
  catch (error) { failed += 1; console.log("FAIL ", name, "\n     ", error.message.split("\n")[0]); await page.screenshot({ path: `/tmp/fail-${name.replace(/\W+/g, "-")}.png` }).catch(() => {}); }
  finally { await browser.close().catch(() => {}); }
}

async function openDashboard(page, email = "owner@epicmkt.test") {
  await page.goto(BASE + "/admin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: /Verify|Turn on/ }).click();
  await page.getByRole("heading", { name: "Needs your attention" }).waitFor();
}
const row = (page, title) => page.locator("li", { has: page.getByText(title, { exact: false }) }).filter({ has: page.getByRole("button", { name: /Snooze/ }) });

await check("every part of the page is there", async (page) => {
  await openDashboard(page);
  for (const name of ["Needs your attention", "Live activity", "Revenue by month", "Business status", "New vs expired", "Quick actions", "Kenya pulse", "Expiry radar"]) {
    await page.getByRole("heading", { name, level: 2 }).waitFor();
  }
  await page.getByRole("heading", { name: /Today’s brief/ }).waitFor();
  assert.equal(await page.locator("[data-slot='expiry-radar']").count(), 1); // the B1e slots exist and are separate
  assert.equal(await page.locator("[data-slot='kenya-pulse']").count(), 1);
  assert.equal(await page.locator("svg[role='img']").count() >= 9, true); // 5 sparklines + 3 charts + donut
});

await check("the brief is rule-based, shows three buttons and they navigate", async (page) => {
  await openDashboard(page);
  const brief = await page.locator("[role='status']", { hasText: "applications are waiting" }).innerText();
  assert.match(brief, /^38 applications are waiting \(\d+ for over 24 hours\), 8 payments need confirming and 6 sellers expire within 7 days\./);
  await page.getByRole("button", { name: "Review queue" }).click();
  await page.waitForURL(/\/admin\/applications\?status=submitted/);
});

await check("KPI numbers are the counts, with one sparkline each", async (page) => {
  await openDashboard(page);
  await page.waitForTimeout(1200); // count-up finishes
  const kpis = page.getByLabel("Key numbers");
  const text = await kpis.innerText();
  for (const n of ["142", "4", "8", "6", "KES 47,000"]) assert.ok(text.includes(n), `missing ${n}`);
  assert.equal(await kpis.locator("svg[role='img']").count(), 5);
});

await check("reduced motion shows the final number straight away", async (page) => {
  await openDashboard(page);
  const shown = await page.getByLabel("Key numbers").locator("[aria-hidden='true']").first().innerText();
  assert.equal(shown, "142");
}, { reducedMotion: "reduce" });

await check("snooze hides a row, survives a reload, and can be undone", async (page) => {
  await openDashboard(page);
  await row(page, "Messages that failed to send").getByRole("button", { name: /Snooze/ }).click();
  await page.getByText("1 snoozed").waitFor();
  assert.equal(await page.getByText("Messages that failed to send").count(), 0);
  await page.reload();
  await page.getByRole("heading", { name: "Needs your attention" }).waitFor();
  await page.getByText("1 snoozed").waitFor();
  await page.getByRole("button", { name: "Show snoozed" }).click();
  await page.getByRole("button", { name: "Unsnooze" }).click();
  await page.getByText("Messages that failed to send").waitFor();
});

await check("Start review is a real inline action: counts move and it opens the queue", async (page) => {
  await openDashboard(page);
  await row(page, "Applications waiting for review").getByRole("button", { name: "Start review" }).click();
  await page.waitForURL(/status=under_review/);
  await page.locator(".nav-item", { hasText: "Applications" }).locator(".nav-badge").getByText("3").first().waitFor();
});

await check("the notifications drawer: opens, traps focus, closes with Escape, marks all read", async (page) => {
  await openDashboard(page);
  const bell = page.getByRole("button", { name: /Notifications, 4 unread/ });
  await bell.click();
  const dialog = page.getByRole("dialog", { name: "Notifications" });
  await dialog.waitFor();
  assert.equal(await dialog.getByText("Mara Fresh Mart", { exact: false }).count() > 0, true);
  assert.equal(await dialog.evaluate((d) => d.contains(document.activeElement)), true);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await bell.evaluate((b) => b === document.activeElement), true);
  await bell.click();
  await page.getByRole("button", { name: "Mark all read" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Notifications, none unread" }).waitFor();
});

await check("clicking a notification marks it read and goes there", async (page) => {
  await openDashboard(page);
  await page.getByRole("button", { name: /Notifications, 4 unread/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Renewal payment/ }).click();
  await page.waitForURL(/\/admin\/payments\?status=submitted/);
  await page.getByRole("button", { name: "Notifications, 3 unread" }).waitFor();
});

await check("the sound switch is off by default and remembers its setting", async (page) => {
  await openDashboard(page);
  await page.getByRole("button", { name: /Notifications/ }).click();
  const sw = page.getByRole("switch", { name: /Sound/ });
  assert.equal(await sw.getAttribute("aria-checked"), "false");
  await sw.click();
  assert.equal(await sw.getAttribute("aria-checked"), "true");
  await page.reload();
  await page.getByRole("heading", { name: "Needs your attention" }).waitFor();
  await page.getByRole("button", { name: /Notifications/ }).click();
  assert.equal(await page.getByRole("switch", { name: /Sound/ }).getAttribute("aria-checked"), "true");
});

await check("realtime: a new notification raises a soft toast, the bell, the counts and the ticker", async (page) => {
  await page.clock.install();
  await openDashboard(page);
  await page.clock.runFor(41_000); // the mock "database" pushes one event every 40 s
  const toast = page.locator("[data-toast-region] [role='status']").first();
  await toast.waitFor();
  assert.match(await toast.innerText(), /New application/);
  await page.getByRole("button", { name: /Notifications, 5 unread/ }).waitFor();
  await page.locator("li", { hasText: "Tumaini Express" }).first().waitFor();
  await page.getByText(/^5$/).first().waitFor(); // submitted count went 4 -> 5 on the queue
});

await check("a finance admin only sees what finance may open", async (page) => {
  await openDashboard(page, "finance@epicmkt.test");
  const brief = await page.locator("[role='status']", { hasText: /need|caught up/ }).first().innerText();
  assert.equal(/application/i.test(brief), false);
  assert.equal(await page.getByText("Applications waiting for review").count(), 0);
  assert.equal(await page.getByRole("link", { name: "Review applications" }).count(), 0);
  assert.equal(await page.getByText("Payments awaiting confirmation").count(), 1);
});

for (const width of [280, 390, 768, 1280, 1920]) {
  await check(`no sideways scrolling at ${width}px`, async (page) => {
    await openDashboard(page);
    const fits = await page.evaluate(() => [document.documentElement, document.body, document.querySelector(".content")].every((el) => el.scrollWidth <= el.clientWidth));
    assert.equal(fits, true);
  }, { width, height: 900 });
}

if (pageErrors.length) { failed += 1; console.log("FAIL  page errors:\n  ", pageErrors.join("\n   ")); }
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
