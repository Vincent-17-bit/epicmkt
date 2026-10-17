import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const EXEC = process.env.CHROMIUM_PATH; // optional; default Playwright browser
const launchOpts = EXEC ? { executablePath: EXEC } : {};
const BASE_URL = process.env.BASE_URL ?? "http://localhost:5175";
const b = await chromium.launch(launchOpts);
let fail = 0;
const ck = (n, ok, d = "") => { if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); };
// z-order tokens
{
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await p.goto(BASE_URL + "/admin", { waitUntil: "networkidle" });
  const z = await p.evaluate(() => ["sticky","header","bulkbar","popover","drawer-scrim","drawer","sheet-scrim","sheet","modal","toast"].map((k) => Number(getComputedStyle(document.documentElement).getPropertyValue(`--admin-z-${k}`))));
  ck("z-index tokens strictly increasing", z.every((v, i) => i === 0 || v > z[i - 1]), z.join(" < "));
  await p.context().close();
}
// text-only zoom 200% + browser zoom (2x => half-width viewport)
for (const [w, h, label] of [[1280, 800, "text 200% @1280"], [390, 844, "text 200% @390"], [320, 568, "text 200% @320"], [640, 400, "browser zoom 200% of 1280x800"], [160, 284, "browser zoom 200% of 320x568 (WCAG reflow 320px at 400%: 320x256 used instead)"]]) {
  const vw = label.includes("320x568 (") ? 320 : w, vh = label.includes("320x568 (") ? 256 : h;
  const ctx = await b.newContext({ viewport: { width: vw, height: vh }, hasTouch: vw < 1024 });
  const page = await ctx.newPage();
  for (const path of ["/admin", "/admin/businesses", "/admin/payments", "/admin/settings"]) {
    await page.goto(BASE_URL + path, { waitUntil: "networkidle" });
    if (label.startsWith("text")) await page.addStyleTag({ content: "html{font-size:200%}" });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const m = document.querySelector(".admin-content");
      const clipped = [...document.querySelectorAll("button, a[href], h1, h2, label, .chip, .tabs__tab, .admin-nav-item")].filter((e) => {
        if (!e.getClientRects().length || getComputedStyle(e).visibility === "hidden") return false;
        const s = getComputedStyle(e);
        if (s.textOverflow === "ellipsis") return false;
        return (s.overflow === "hidden" || s.overflowX === "hidden") && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1);
      }).map((e) => (e.className || e.tagName).toString().slice(0, 26));
      return { doc: document.scrollingElement.scrollWidth - innerWidth, main: m.scrollWidth - m.clientWidth, clipped: [...new Set(clipped)].slice(0, 4), headerH: document.querySelector(".admin-header").getBoundingClientRect().height };
    });
    ck(`${label} ${path}: no sideways scroll, nothing clipped`, r.doc <= 0 && r.main <= 1 && r.clipped.length === 0, JSON.stringify(r));
  }
  await page.screenshot({ path: `/tmp/zoom-${w}.png` });
  await ctx.close();
}
await b.close();
process.exit(fail ? 1 : 0);
