import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const EXEC = process.env.CHROMIUM_PATH; // optional; default Playwright browser
const launchOpts = EXEC ? { executablePath: EXEC } : {};
const BASE_URL = process.env.BASE_URL ?? "http://localhost:5175";
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const [,, label = "after"] = process.argv;
const out = `docs/screenshots/${label}`;
fs.mkdirSync(out, { recursive: true });
const VIEWPORTS = [[320,568],[360,740],[390,844],[414,896],[568,320],[768,1024],[820,1180],[1024,768],[1280,800],[1440,900],[1920,1080],[2560,1440]];
const ROUTES = [["command","/admin"],["applications","/admin/applications"],["businesses","/admin/businesses"],["payments","/admin/payments"],["settings","/admin/settings"],["404","/does-not-exist"]];
const browser = await chromium.launch(launchOpts);
const rows = [];
for (const theme of ["light", "dark"]) {
  for (const [w, h] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, hasTouch: w < 1024 });
    await ctx.addInitScript((t) => localStorage.setItem("epicmkt-admin-theme", t), theme);
    for (const [name, path] of ROUTES) {
      const page = await ctx.newPage();
      const errors = [];
      page.on("console", (m) => { if (["error", "warning"].includes(m.type())) errors.push(m.text().slice(0, 120)); });
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
      await page.goto(BASE_URL + path, { waitUntil: "networkidle" });
      await page.waitForTimeout(450);
      const m = await page.evaluate(() => {
        const doc = document.scrollingElement;
        const main = document.querySelector(".admin-content");
        const stray = [];
        const vis = (e) => { const s = getComputedStyle(e); return s.visibility !== "hidden" && s.display !== "none" && e.getClientRects().length; };
        // anything poking past the viewport that is not inside a scroll container
        for (const el of document.querySelectorAll("body *")) {
          if (!vis(el)) continue;
          const r = el.getBoundingClientRect();
          if (r.right <= innerWidth + 1 && r.left >= -1) continue;
          let p = el.parentElement, clipped = false;
          while (p && p !== document.body) { const o = getComputedStyle(p); if (o.overflowX !== "visible" || o.position === "fixed" || o.visibility === "hidden") { clipped = true; break; } p = p.parentElement; }
          if (!clipped && getComputedStyle(el).position !== "fixed") stray.push((el.className || el.tagName).toString().slice(0, 30));
        }
        const ctl = [...document.querySelectorAll("button, a[href], input, select, textarea, [role=tab]")].filter((e) => vis(e) && !e.closest(".overflow__measure") && !e.classList.contains("admin-skip") && !(e.type === "checkbox" && e.closest("label")));
        const overlaps = [];
        for (let i = 0; i < ctl.length; i += 1) for (let j = i + 1; j < ctl.length; j += 1) {
          const a = ctl[i], b = ctl[j];
          if (a.contains(b) || b.contains(a)) continue;
          const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
          const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          if (w > 3 && h > 3 && ra.top < innerHeight && rb.top < innerHeight) overlaps.push(`${(a.getAttribute("aria-label") || a.textContent || a.className).trim().slice(0, 18)} x ${(b.getAttribute("aria-label") || b.textContent || b.className).trim().slice(0, 18)}`);
        }
        return { docOver: doc.scrollWidth - innerWidth, mainOver: main ? main.scrollWidth - main.clientWidth : 0, stray: [...new Set(stray)].slice(0, 4), overlaps: overlaps.slice(0, 3) };
      });
      await page.evaluate(axeSource);
      const axe = await page.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] }).then((r) => r.violations.map((v) => `${v.id}(${v.nodes.length}): ${v.nodes[0].target.join(" ").slice(0, 60)}`)));
      rows.push({ theme, w, h, route: name, ...m, axe, errors: errors.slice(0, 2) });
      await page.screenshot({ path: `${out}/${theme}-${w}x${h}-${name}.png` });
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(rows, null, 1));
const bad = rows.filter((r) => r.docOver > 0 || r.mainOver > 0 || r.stray.length || r.overlaps.length || r.axe.length || r.errors.length);
console.log(`checked ${rows.length} combos; ${bad.length} with findings`);
for (const r of bad.slice(0, 50)) console.log(r.theme, `${r.w}x${r.h}`, r.route, JSON.stringify({ doc: r.docOver, main: r.mainOver, stray: r.stray, ov: r.overlaps, axe: r.axe, err: r.errors }));
