import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const EXEC = process.env.CHROMIUM_PATH; // optional; default Playwright browser
const launchOpts = EXEC ? { executablePath: EXEC } : {};
const BASE_URL = process.env.BASE_URL ?? "http://localhost:5175";
const out = "docs/screenshots/after/states";
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch(launchOpts);
async function pg(w, h, theme, path = "/admin/businesses") {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: theme, hasTouch: w < 1024 });
  await ctx.addInitScript((t) => localStorage.setItem("epicmkt-admin-theme", t), theme);
  const p = await ctx.newPage();
  await p.goto(BASE_URL + path, { waitUntil: "networkidle" });
  await p.waitForTimeout(500);
  return p;
}
const shot = (p, n) => p.screenshot({ path: `${out}/${n}.png` });
let p;
p = await pg(390, 844, "dark", "/admin"); await p.click('[aria-label="Open menu"]'); await p.waitForTimeout(400); await shot(p, "01-drawer-open-390-dark");
p = await pg(390, 844, "light"); await p.locator(".dt__checkbox input").first().check(); await p.waitForTimeout(300); await shot(p, "02-bulk-bar-390-light");
await p.locator(".dt__selection .dt__pop button").click(); await p.waitForTimeout(350); await shot(p, "03-bulk-more-sheet-390-light");
p = await pg(390, 844, "dark"); await p.locator(".dt__toggle").first().click(); await p.waitForTimeout(300); await shot(p, "04-card-expanded-390-dark");
p = await pg(390, 844, "light"); await p.getByRole("button", { name: /^Filters/ }).click(); await p.waitForTimeout(400); await shot(p, "05-filters-bottom-sheet-390-light");
p = await pg(820, 1180, "dark"); await p.getByRole("button", { name: /^Filters/ }).click(); await p.waitForTimeout(400); await shot(p, "06-filters-slide-over-820-dark");
p = await pg(1280, 800, "light"); await p.getByRole("button", { name: "Columns" }).click(); await p.waitForTimeout(300); await shot(p, "07-columns-popover-1280-light");
p = await pg(1280, 800, "dark"); await p.locator(".dt__checkbox input").nth(1).check(); await p.locator(".dt__selection .overflow > .admin-button").nth(3).click(); await p.waitForTimeout(400); await shot(p, "08-modal-centered-1280-dark");
p = await pg(1280, 800, "dark"); await p.locator(".admin-sidebar__rail-only").click(); await p.waitForTimeout(400); await shot(p, "09-sidebar-rail-1280-dark");
p = await pg(1280, 800, "light"); await p.evaluate(() => { const s = document.querySelector(".dt__scroll"); s.scrollTop = 200; s.scrollLeft = 360; }); await p.waitForTimeout(300); await shot(p, "10-sticky-header-and-column-1280-light");
p = await pg(568, 320, "light"); await shot(p, "11-landscape-568x320-light");
p = await pg(360, 740, "dark"); await p.locator(".dt__checkbox input").first().check(); await p.locator(".dt__selection .dt__pop button").click(); await p.waitForTimeout(300); await p.locator(".sheet--bottom .admin-button--menu").nth(1).click(); await p.waitForTimeout(400); await shot(p, "12-action-dialog-bottom-sheet-360-dark");
await b.close();
