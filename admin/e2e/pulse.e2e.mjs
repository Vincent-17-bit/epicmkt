import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const BASE = process.env.ADMIN_URL ?? "http://localhost:4173";
const launch = () => chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: process.env.CHROMIUM_ARGS?.split(" ") ?? [] });
let failed = 0;
const pageErrors = [];

async function check(name, fn, { width = 1280, height = 900, colorScheme = "light" } = {}) {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width, height }, colorScheme });
  await context.route(/tile\.openstreetmap\.org/, (route) => route.abort());
  const page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(`${name}: ${e.message}`));
  try { await fn(page); console.log("ok   ", name); }
  catch (error) { failed += 1; console.log("FAIL ", name, "\n     ", error.message.split("\n")[0]); await page.screenshot({ path: `/tmp/fail-${name.replace(/\W+/g, "-")}.png` }).catch(() => {}); }
  finally { await browser.close().catch(() => {}); }
}

async function openDashboard(page) {
  await page.goto(BASE + "/admin");
  await page.getByLabel("Email").fill("owner@epicmkt.test");
  await page.getByLabel("Password", { exact: true }).fill("correct-horse");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: /Verify|Turn on/ }).click();
  await page.getByRole("heading", { name: "Needs your attention" }).waitFor();
  await page.locator("[data-slot=expiry-radar] svg[role=group]").waitFor();
  await page.locator("[data-slot=kenya-pulse] .leaflet-marker-icon").first().waitFor();
}
const radar = (page) => page.locator("[data-slot=expiry-radar]");
const pulse = (page) => page.locator("[data-slot=kenya-pulse]");

await check("radar draws one labelled point per business and the legend adds up", async (page) => {
  await openDashboard(page);
  const points = await radar(page).locator("g[role=button]").count();
  assert.ok(points > 5, `points: ${points}`);
  const legend = await radar(page).locator("ul[aria-label=Legend] b").allTextContents();
  assert.equal(legend.reduce((a, b) => a + Number(b), 0), points);
  for (const label of ["Grace", "1d", "3d", "7d", "14d", "30d"]) await radar(page).locator("svg text", { hasText: new RegExp(`^${label}$`) }).first().waitFor();
  const shapes = await radar(page).locator("g[role=button] path").evaluateAll((els) => new Set(els.map((e) => e.getAttribute("d")?.[0] + e.getAttribute("d")?.length)).size);
  assert.ok(shapes >= 3, `distinct shapes: ${shapes}`);
});

await check("hover shows a tooltip and click opens Peek, Escape closes it", async (page) => {
  await openDashboard(page);
  const point = radar(page).locator("g[role=button]").first();
  const name = (await point.getAttribute("aria-label")).split(",")[0];
  await point.hover();
  const tip = radar(page).getByRole("tooltip");
  await tip.waitFor();
  assert.ok((await tip.textContent()).includes(name));
  await point.click();
  const dialog = page.getByRole("dialog", { name });
  await dialog.waitFor();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
});

await check("keyboard: Tab to a point, Enter opens Peek", async (page) => {
  await openDashboard(page);
  const point = radar(page).locator("g[role=button]").first();
  await point.focus();
  await radar(page).getByRole("tooltip").waitFor();
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").waitFor();
});

await check("table toggle lists every business and Peek works from it", async (page) => {
  await openDashboard(page);
  const points = await radar(page).locator("g[role=button]").count();
  await radar(page).getByRole("button", { name: "View as table" }).click();
  assert.equal(await radar(page).locator("tbody tr").count(), points);
  assert.equal(await radar(page).locator("svg[role=group]").count(), 0);
  await radar(page).locator("tbody tr").first().getByRole("button", { name: /Preview/ }).click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await radar(page).getByRole("button", { name: "View radar" }).click();
  await radar(page).locator("svg[role=group]").waitFor();
});

await check("map: layer toggles change what is shown and listed", async (page) => {
  await openDashboard(page);
  const head = pulse(page).locator("p[aria-live=polite]");
  const all = Number((await head.textContent()).match(/^\d+/)[0]);
  assert.ok(all > 0);
  const layer = (label) => pulse(page).locator("ul[aria-label='Map layers'] button", { hasText: label });
  const buttons = pulse(page).locator("ul[aria-label='Map layers'] button");
  assert.equal(await buttons.count(), 5);
  for (const label of ["Live", "Expiring in 7 days", "In grace", "Open flags"]) await layer(label).click();
  await page.waitForTimeout(300);
  const onlyApps = Number((await head.textContent()).match(/^\d+/)[0]);
  assert.ok(onlyApps > 0 && onlyApps < all, `${onlyApps} vs ${all}`);
  await layer("Live").click();
  await page.waitForTimeout(300);
  assert.ok(Number((await head.textContent()).match(/^\d+/)[0]) > onlyApps);
  for (const label of ["Expiring in 7 days", "In grace", "Open flags", "Applications", "Live"]) {
    const b = layer(label);
    if ((await b.getAttribute("aria-pressed")) === "true") await b.click();
  }
  await pulse(page).getByText(/Nothing in this part of the map/).waitFor();
});

await check("map: list follows the viewport, item click zooms, list Peek opens the drawer", async (page) => {
  await openDashboard(page);
  const head = pulse(page).locator("p[aria-live=polite]");
  const before = Number((await head.textContent()).match(/^\d+/)[0]);
  const map = pulse(page).getByRole("region", { name: /Map of businesses/ });
  await map.scrollIntoViewIfNeeded();
  const box = await map.boundingBox();
  await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.6);
  for (let i = 0; i < 4; i += 1) { await page.mouse.wheel(0, -400); await page.waitForTimeout(250); }
  await page.waitForTimeout(600);
  const after = Number((await head.textContent()).match(/^\d+/)[0]);
  assert.ok(after < before, `${after} should be fewer than ${before}`);
  await pulse(page).getByRole("button", { name: "Reset view" }).click();
  await page.waitForTimeout(600);
  assert.equal(Number((await head.textContent()).match(/^\d+/)[0]), before);
  const row = pulse(page).locator("ul > li").filter({ has: page.getByRole("button", { name: /Preview/ }) }).first();
  const name = (await row.locator("strong").textContent()).trim();
  await row.getByRole("button", { name: /Preview/ }).click();
  await page.getByRole("dialog", { name }).waitFor();
});

await check("map: clicking a marker opens Peek", async (page) => {
  await openDashboard(page);
  await pulse(page).locator("ul:not([aria-label]) > li button").first().click();
  const marker = pulse(page).locator(".leaflet-marker-icon[title]:visible").first();
  await marker.waitFor();
  await page.waitForTimeout(800);
  await marker.click({ force: true });
  await page.getByRole("dialog").waitFor();
});

for (const [label, opts] of [["phone, dark", { width: 375, height: 800, colorScheme: "dark" }], ["tablet, light", { width: 820, height: 1000 }]]) {
  await check(`no sideways scroll or clipped panels on ${label}`, async (page) => {
    await openDashboard(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, `overflow ${overflow}px`);
    const r = await radar(page).boundingBox();
    const m = await pulse(page).boundingBox();
    assert.ok(r.x >= 0 && r.x + r.width <= opts.width + 1 && m.x >= 0 && m.x + m.width <= opts.width + 1);
  }, opts);
}

if (pageErrors.length) { failed += 1; console.log("PAGE ERRORS\n ", pageErrors.join("\n  ")); }
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
