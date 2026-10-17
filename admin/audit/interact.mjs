import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const EXEC = process.env.CHROMIUM_PATH; // optional; default Playwright browser
const launchOpts = EXEC ? { executablePath: EXEC } : {};
const BASE_URL = process.env.BASE_URL ?? "http://localhost:5175";

const BASE = BASE_URL;
const browser = await chromium.launch(launchOpts);
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

async function open(width, height, path, { theme = "light", touch } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme, hasTouch: touch ?? width < 1024 });
  await ctx.addInitScript((t) => localStorage.setItem("epicmkt-admin-theme", t), theme);
  const page = await ctx.newPage();
  page.errors = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) page.errors.push(m.text()); });
  page.on("pageerror", (e) => page.errors.push(String(e)));
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForSelector("main", { timeout: 5000 });
  await page.waitForTimeout(250);
  return { ctx, page };
}

const rect = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; }, sel);
const insideSidebar = (page) => page.evaluate(() => !!document.activeElement?.closest("#admin-sidebar"));


async function pickAction(page, label) {
  const inline = page.locator(".dt__selection .overflow > .admin-button", { hasText: label });
  if (await inline.count()) { await inline.click(); return; }
  await page.locator(".dt__selection .dt__pop button").click();
  await page.waitForTimeout(250);
  await page.locator(".dt__panel .admin-button--menu, .sheet--bottom .admin-button--menu", { hasText: label }).first().click();
}

// ---------------------------------------------------------------- drawer
{
  console.log("\n# Mobile drawer (390x844)");
  const { ctx, page } = await open(390, 844, "/admin/businesses");
  const opener = page.locator('[aria-label="Open menu"]');
  const closedHidden = await page.evaluate(() => getComputedStyle(document.querySelector("#admin-sidebar")).visibility === "hidden");
  check("drawer closed by default and hidden from tab order", closedHidden);

  await opener.click();
  await page.waitForTimeout(300);
  check("opens", await page.locator("#admin-sidebar.is-open").count() === 1);
  check("scrim shown", await page.locator(".admin-scrim").count() === 1);
  check("scroll locked", await page.evaluate(() => document.documentElement.classList.contains("is-scroll-locked") && getComputedStyle(document.querySelector(".admin-content")).overflow === "hidden"));
  check("focus moves into drawer", await insideSidebar(page));
  let trapped = true;
  for (let i = 0; i < 14; i += 1) { await page.keyboard.press("Tab"); trapped &&= await insideSidebar(page); }
  for (let i = 0; i < 6; i += 1) { await page.keyboard.press("Shift+Tab"); trapped &&= await insideSidebar(page); }
  check("Tab/Shift+Tab trapped inside drawer", trapped);
  check("page behind is inert", await page.evaluate(() => document.querySelector(".admin-main").inert === true));

  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check("Esc closes", await page.locator("#admin-sidebar.is-open").count() === 0);
  check("focus restored to opener", await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Open menu"));
  check("scroll unlocked", await page.evaluate(() => !document.documentElement.classList.contains("is-scroll-locked")));

  await opener.click(); await page.waitForTimeout(300);
  await page.mouse.click(370, 500);
  await page.waitForTimeout(300);
  check("backdrop closes", await page.locator("#admin-sidebar.is-open").count() === 0);

  await opener.click(); await page.waitForTimeout(300);
  await page.locator('#admin-sidebar a[href="/admin/payments"]').click();
  await page.waitForTimeout(400);
  check("link navigates and closes", page.url().endsWith("/admin/payments") && await page.locator("#admin-sidebar.is-open").count() === 0);
  check("aria-current on active link", await page.evaluate(() => document.querySelector('#admin-sidebar a[aria-current="page"]')?.textContent.includes("Payments")));

  await opener.click(); await page.waitForTimeout(300);
  await page.evaluate(() => {
    const el = document.querySelector("#admin-sidebar");
    const mk = (x, y) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    const fire = (type, x, y) => el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === "touchend" ? [] : [mk(x, y)], changedTouches: [mk(x, y)] }));
    fire("touchstart", 250, 400); fire("touchmove", 200, 405); fire("touchmove", 120, 410); fire("touchend", 120, 410);
  });
  await page.waitForTimeout(300);
  check("swipe left closes", await page.locator("#admin-sidebar.is-open").count() === 0);
  check("no console errors", page.errors.length === 0, page.errors[0]?.slice(0, 120));
  await ctx.close();
}

// ---------------------------------------------------------------- collapsed / expanded sidebar
{
  console.log("\n# Sidebar rail (1280x800)");
  const { ctx, page } = await open(1280, 800, "/admin");
  const w1 = (await rect(page, "#admin-sidebar")).width;
  await page.locator(".admin-sidebar__rail-only").click();
  await page.waitForTimeout(400);
  const w2 = (await rect(page, "#admin-sidebar")).width;
  check("collapses to rail", w1 > 250 && w2 < 100, `${w1} -> ${w2}`);
  const clip = await page.evaluate(() => {
    const aside = document.querySelector("#admin-sidebar").getBoundingClientRect();
    return [...document.querySelectorAll("#admin-sidebar .admin-nav-item, #admin-sidebar .admin-sidebar__logo, #admin-sidebar .admin-system-card")].filter((e) => e.getClientRects().length).filter((e) => { const r = e.getBoundingClientRect(); return r.left < aside.left - 0.5 || r.right > aside.right + 0.5; }).length;
  });
  check("rail: nothing clipped outside sidebar", clip === 0);
  check("rail: icons visible and labels kept for screen readers", await page.evaluate(() => [...document.querySelectorAll(".admin-nav-item")].filter((a) => a.matches("a")).every((a) => a.querySelector("svg") && a.textContent.trim().length > 0)));
  check("rail: badges and footer visible", await page.evaluate(() => document.querySelectorAll(".is-collapsed .admin-nav-item__badge").length === 4 && !!document.querySelector(".admin-system-card__compact") && getComputedStyle(document.querySelector(".admin-system-card__compact")).display !== "none"));
  await page.locator(".admin-sidebar__rail-only").click();
  await page.waitForTimeout(400);
  check("expands back", (await rect(page, "#admin-sidebar")).width === w1);
  await ctx.close();
}

// ---------------------------------------------------------------- table desktop
{
  console.log("\n# Table (1280x800)");
  const { ctx, page } = await open(1280, 800, "/admin/businesses");
  check("real table layout (header row present, no cards)", await page.locator(".dt__head").count() === 1 && await page.locator(".dt__card").count() === 0);
  const sc = await page.evaluate(() => { const s = document.querySelector(".dt__scroll"); return { sw: s.scrollWidth, cw: s.clientWidth }; });
  check("table scrolls horizontally inside its wrapper", sc.sw > sc.cw, `${sc.sw} > ${sc.cw}`);
  check("main/page do not scroll sideways", await page.evaluate(() => { const m = document.querySelector(".admin-content"); return m.scrollWidth <= m.clientWidth + 1 && document.scrollingElement.scrollWidth <= innerWidth; }));
  await page.evaluate(() => { const s = document.querySelector(".dt__scroll"); s.scrollTop = 300; s.scrollLeft = 260; });
  await page.waitForTimeout(200);
  const st = await page.evaluate(() => {
    const s = document.querySelector(".dt__scroll").getBoundingClientRect();
    const h = document.querySelector(".dt__head").getBoundingClientRect();
    const first = document.querySelector(".dt__hcell--first").getBoundingClientRect();
    const rowFirst = document.querySelector(".dt__cell--first").getBoundingClientRect();
    return { headTop: h.top - s.top, firstLeft: first.left - s.left, rowFirstLeft: rowFirst.left - s.left };
  });
  check("header stays sticky while scrolled", Math.abs(st.headTop) <= 2, `top offset ${st.headTop}`);
  check("first column stays sticky (header and rows)", Math.abs(st.firstLeft - 44) <= 3 && Math.abs(st.rowFirstLeft - 44) <= 3, `${st.firstLeft}/${st.rowFirstLeft}`);

  await page.evaluate(() => { const s = document.querySelector(".dt__scroll"); s.scrollTop = 0; s.scrollLeft = 0; });
  const headersBefore = await page.locator(".dt__hcell").allInnerTexts();
  await page.getByRole("button", { name: "Columns" }).click();
  await page.waitForTimeout(250);
  const panel = await rect(page, ".dt__panel");
  check("column chooser opens as popover inside viewport", !!panel && panel.left >= 0 && panel.right <= 1280 && panel.top >= 0 && panel.bottom <= 800);
  await page.locator('.dt__panel label.check', { hasText: "Plan" }).locator("input").uncheck();
  await page.waitForTimeout(150);
  const afterHide = await page.locator(".dt__hcell").allInnerTexts();
  check("column chooser hides a column", headersBefore.some((t) => /plan/i.test(t)) && !afterHide.some((t) => /^plan$/i.test(t.trim())));
  await page.locator(".dt__panel").getByRole("button", { name: "Show all" }).click();
  await page.waitForTimeout(150);
  const afterAll = await page.locator(".dt__hcell").allInnerTexts();
  check("Show all reveals hidden columns", afterAll.some((t) => /strikes/i.test(t)) && afterAll.some((t) => /plan/i.test(t)));
  await page.keyboard.press("Escape");
  check("Esc closes popover and returns focus to trigger", await page.locator(".dt__panel").count() === 0 && await page.evaluate(() => document.activeElement?.textContent?.includes("Columns")));
  await ctx.close();
}

// ---------------------------------------------------------------- popover flip / shift
{
  console.log("\n# Popover positioning");
  const { ctx, page } = await open(900, 360, "/admin/businesses");
  await page.getByRole("button", { name: "Columns" }).click();
  await page.waitForTimeout(250);
  const r = await rect(page, ".dt__panel");
  check("short viewport: panel stays fully on screen", r.top >= 0 && r.bottom <= 360 && r.left >= 0 && r.right <= 900, JSON.stringify(r));
  await ctx.close();
  const b = await open(1280, 800, "/admin/businesses");
  await b.page.evaluate(() => { const c = document.querySelector(".admin-content"); c.scrollTop = 0; });
  await b.page.setViewportSize({ width: 1280, height: 330 });
  await b.page.waitForTimeout(150);
  await b.page.getByRole("button", { name: "Views" }).click();
  await b.page.waitForTimeout(250);
  const p2 = await rect(b.page, ".dt__panel");
  check("Views popover also stays on screen when short", p2.bottom <= 330 && p2.top >= 0);
  await b.ctx.close();
  const m = await open(390, 844, "/admin/businesses");
  await m.page.getByRole("button", { name: "Columns" }).click();
  await m.page.waitForTimeout(300);
  const sheet = await rect(m.page, ".sheet--bottom");
  check("<768: popover renders as bottom sheet", !!sheet && Math.abs(sheet.bottom - 844) <= 1 && sheet.width === 390, JSON.stringify(sheet));
  check("bottom sheet max-height <= 100dvh - 2rem", !!sheet && sheet.height <= 844 - 32 + 1);
  await m.page.keyboard.press("Escape");
  await m.page.waitForTimeout(200);
  check("Esc closes sheet, focus restored", await m.page.locator(".sheet--bottom").count() === 0 && await m.page.evaluate(() => document.activeElement?.closest(".dt__pop") !== null));
  await m.ctx.close();
}

// ---------------------------------------------------------------- cards on phones
{
  console.log("\n# Cards + bulk bar (390x844)");
  const { ctx, page } = await open(390, 844, "/admin/businesses");
  check("cards instead of table", await page.locator(".dt__card").count() > 0 && await page.locator(".dt__head").count() === 0);
  check("no horizontal scroll anywhere", await page.evaluate(() => { const m = document.querySelector(".admin-content"); const s = document.querySelector(".dt__scroll"); return m.scrollWidth <= m.clientWidth + 1 && s.scrollWidth <= s.clientWidth + 1 && document.scrollingElement.scrollWidth <= innerWidth; }));
  const card = await page.evaluate(() => { const c = document.querySelector(".dt__card"); return { chip: !!c.querySelector(".chip"), name: !!c.querySelector(".biz-name"), metric: /paid until/i.test(c.querySelector(".dt__card-metric")?.textContent ?? "") }; });
  check("card shows name + status chip + key metric", card.chip && card.name && card.metric, JSON.stringify(card));
  const tgt = await page.evaluate(() => { const c = document.querySelector(".dt__card"); return [".dt__checkbox", ".dt__toggle"].map((s) => { const r = c.querySelector(s).getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }); });
  check("checkbox and expand toggle are 44px targets", tgt.every(([w, h]) => w >= 44 && h >= 44), JSON.stringify(tgt));
  await page.locator(".dt__toggle").first().click();
  await page.waitForTimeout(250);
  const det = await page.evaluate(() => { const d = document.querySelector(".dt__card-details dl"); return d ? { cols: getComputedStyle(d).gridTemplateColumns.split(" ").length, items: d.children.length } : null; });
  check("secondary fields in two-column definition list", det && det.cols === 2 && det.items >= 6, JSON.stringify(det));

  await page.locator(".dt__checkbox input").first().check();
  await page.waitForTimeout(300);
  const bar = await page.evaluate(() => { const b = document.querySelector(".dt__selection"); const r = b.getBoundingClientRect(); return { pos: getComputedStyle(b).position, bottom: r.bottom, top: r.top, h: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--admin-bulkbar-h")), z: getComputedStyle(b).zIndex }; });
  check("bulk bar is sticky at the bottom", bar.pos === "fixed" && Math.abs(bar.bottom - 844) <= 1, JSON.stringify(bar));
  check("bulk bar height published to --admin-bulkbar-h", Math.abs(bar.h - (bar.bottom - bar.top)) <= 1);
  check("bulk bar z-index below modal tier", Number(bar.z) < 70);

  // Scroll everything to the end: the last row must clear the bar.
  await page.evaluate(() => { const m = document.querySelector(".admin-content"); m.scrollTop = m.scrollHeight; const s = document.querySelector(".dt__scroll"); s.scrollTop = s.scrollHeight; });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const s = document.querySelector(".dt__scroll"); s.scrollTop = s.scrollHeight; });
  await page.waitForTimeout(300);
  const clear = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".dt__row")].sort((a, b) => a.getBoundingClientRect().bottom - b.getBoundingClientRect().bottom);
    const last = rows[rows.length - 1].getBoundingClientRect();
    const barTop = document.querySelector(".dt__selection").getBoundingClientRect().top;
    const sc = document.querySelector(".dt__scroll"); const sr = sc.getBoundingClientRect();
    return { lastBottom: last.bottom, barTop, atEnd: sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2, scrollBottom: sr.bottom };
  });
  check("last row never hidden behind bulk bar", clear.lastBottom <= clear.barTop + 1, JSON.stringify(clear));

  const fit = await page.evaluate(() => ({ shown: document.querySelectorAll(".dt__selection .overflow > .admin-button").length, more: [...document.querySelectorAll(".dt__selection .dt__pop button")].some((b) => /more|actions/i.test(b.textContent)) }));
  check("tight width: actions collapse into overflow menu", fit.more && fit.shown < 9, JSON.stringify(fit));
  const barRect = await rect(page, ".dt__selection");
  check("bulk bar is within the viewport (home indicator safe)", barRect.bottom <= 844 + 1 && barRect.height < 200);

  await page.locator(".dt__selection .dt__pop button").click();
  await page.waitForTimeout(300);
  check("More opens a sheet listing remaining actions", await page.locator(".sheet--bottom .admin-button--menu").count() > 0);
  const names = await page.locator(".sheet--bottom .admin-button--menu").allInnerTexts();
  const pick = names.find((n) => /^tag$/i.test(n.trim())) ?? names[0];
  await page.locator(".sheet--bottom .admin-button--menu", { hasText: pick }).first().click();
  await page.waitForTimeout(350);
  const dlg = await rect(page, ".sheet-layer--modal .sheet");
  check("action dialog opens as bottom sheet above everything", !!dlg && dlg.width === 390 && Math.abs(dlg.bottom - 844) <= 1, JSON.stringify(dlg));
  check("dialog max-height respects 100dvh - 2rem", !!dlg && dlg.height <= 844 - 32 + 1);
  const footer = await rect(page, ".sheet-layer--modal .sheet__footer");
  check("dialog footer is pinned to the bottom", !!footer && footer.bottom <= 844 + 1 && footer.bottom >= dlg.bottom - 1);
  check("focus is inside dialog", await page.evaluate(() => !!document.activeElement?.closest(".sheet")));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  check("Esc closes dialog", await page.locator(".sheet-layer--modal").count() === 0);
  await ctx.close();
}

// ---------------------------------------------------------------- toast vs bulk bar
{
  console.log("\n# Toast stacking (390x844)");
  const { ctx, page } = await open(390, 844, "/admin/businesses");
  await page.locator(".dt__checkbox input").first().check();
  await page.waitForTimeout(250);
  // choose a harmless action via the overflow menu/inline button
  const inline = page.locator(".dt__selection .overflow > .admin-button", { hasText: /Export/ });
  if (await inline.count()) await inline.click();
  else {
    await page.locator(".dt__selection .dt__pop button").click();
    await page.locator(".sheet--bottom .admin-button--menu", { hasText: "Export CSV" }).click();
  }
  await page.waitForTimeout(300);
  await page.locator(".sheet-layer--modal textarea").fill("Checking toast placement");
  await page.locator(".sheet-layer--modal button[type=submit]").click();
  await page.waitForTimeout(700);
  await page.locator(".dt__checkbox input").nth(1).check();
  await page.waitForTimeout(400);
  const t = await page.evaluate(() => { const toast = document.querySelector(".toast"); const bar = document.querySelector(".dt__selection"); if (!toast || !bar) return null; const a = toast.getBoundingClientRect(); const b = bar.getBoundingClientRect(); return { toastBottom: a.bottom, barTop: b.top, centered: Math.abs((a.left + a.right) / 2 - innerWidth / 2) < 2, live: !!toast.closest("[aria-live=polite]") }; });
  check("toast appears bottom-center above the bulk bar", !!t && t.toastBottom <= t.barTop + 1 && t.centered, JSON.stringify(t));
  check("toast lives in aria-live=polite region", !!t && t.live);
  await ctx.close();

  const d = await open(1280, 800, "/admin/businesses");
  await d.page.locator(".dt__checkbox input").first().check();
  await pickAction(d.page, "Export");
  await d.page.waitForTimeout(300);
  const dm = await rect(d.page, ".sheet--center");
  check("desktop modal is centered with max-width", !!dm && Math.abs((dm.left + dm.right) / 2 - 640) < 2 && dm.width <= 544 + 1 && dm.height <= 800 - 32 + 1, JSON.stringify(dm));
  let trapped = true;
  for (let i = 0; i < 10; i += 1) { await d.page.keyboard.press("Tab"); trapped &&= await d.page.evaluate(() => !!document.activeElement?.closest(".sheet")); }
  check("modal traps focus", trapped);
  await d.page.keyboard.press("Escape");
  await d.page.waitForTimeout(250);
  check("modal closes with Esc and restores focus into the bulk bar", await d.page.evaluate(() => !!document.activeElement?.closest(".dt__selection")));
  await pickAction(d.page, "Export");
  await d.page.locator(".sheet-layer--modal textarea").fill("Checking toast placement");
  await d.page.locator(".sheet-layer--modal button[type=submit]").click();
  await d.page.waitForTimeout(700);
  const tr = await d.page.evaluate(() => { const r = document.querySelector(".toast")?.getBoundingClientRect(); return r ? { right: innerWidth - r.right, bottom: innerHeight - r.bottom } : null; });
  check("desktop toast is bottom-right", !!tr && tr.right < 48 && tr.bottom < 80, JSON.stringify(tr));
  await d.ctx.close();
}

// ---------------------------------------------------------------- filters
for (const [w, h, expect] of [[390, 844, "bottom"], [820, 1180, "end"], [1280, 800, "inline"]]) {
  console.log(`\n# Filters (${w}x${h})`);
  const { ctx, page } = await open(w, h, "/admin/businesses");
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.waitForTimeout(350);
  if (expect === "inline") {
    check("inline panel on lg+", await page.locator("section.filters").count() === 1 && await page.locator(".sheet").count() === 0);
  } else {
    const s = await rect(page, `.sheet--${expect}`);
    check(`${expect === "bottom" ? "bottom sheet" : "slide-over"} below 1024px`, !!s, JSON.stringify(s));
    const f = await rect(page, ".sheet__footer");
    check("Apply/Reset footer pinned within viewport", f && f.bottom <= h + 1 && f.bottom >= h - 1, JSON.stringify(f));
    check("footer has Apply and Reset", await page.locator(".sheet__footer").innerText().then((t) => /Reset/.test(t) && /Apply/.test(t)));
    const hs = await page.evaluate(() => { const b = document.querySelector(".sheet__body"); return { sh: b.scrollHeight, ch: b.clientHeight, ov: getComputedStyle(b).overflowY }; });
    check("sheet body scrolls internally", hs.ov === "auto" && hs.sh >= hs.ch);
    await page.locator('.sheet select').first().selectOption({ index: 1 });
    await page.getByRole("button", { name: "Apply" }).click();
    await page.waitForTimeout(500);
    check("Apply commits and closes", await page.locator(".sheet").count() === 0 && await page.getByRole("button", { name: /Filters \(1\)/ }).count() === 1);
    await page.getByRole("button", { name: /^Filters/ }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Reset" }).click();
    await page.getByRole("button", { name: "Apply" }).click();
    await page.waitForTimeout(500);
    check("Reset then Apply clears filters", await page.getByRole("button", { name: /^Filters$/ }).count() === 1);
  }
  await ctx.close();
}

// ---------------------------------------------------------------- tabs
{
  console.log("\n# Tabs (390x844)");
  const { ctx, page } = await open(390, 844, "/admin/businesses");
  const t = await page.evaluate(() => { const e = document.querySelector(".tabs"); const cs = getComputedStyle(e); return { scrolls: e.scrollWidth > e.clientWidth, snap: cs.scrollSnapType, mask: cs.maskImage || cs.webkitMaskImage, end: e.style.getPropertyValue("--tabs-fade-end"), start: e.style.getPropertyValue("--tabs-fade-start"), snapAlign: getComputedStyle(e.querySelector(".tabs__tab")).scrollSnapAlign, h: e.querySelector(".tabs__tab").getBoundingClientRect().height }; });
  check("tabs scroll horizontally", t.scrolls);
  check("scroll-snap on", /x/.test(t.snap) && t.snapAlign === "start", `${t.snap} / ${t.snapAlign}`);
  check("fade edges: end only at scroll start", t.end === "1.5rem" && t.start === "0px" && /gradient/.test(t.mask), JSON.stringify({ s: t.start, e: t.end }));
  await page.evaluate(() => { document.querySelector(".tabs").scrollLeft = 120; });
  await page.waitForTimeout(250);
  check("fade edges: both when scrolled in the middle", await page.evaluate(() => document.querySelector(".tabs").style.getPropertyValue("--tabs-fade-start") === "1.5rem"));
  check("tabs are 44px tall", t.h >= 44);
  check("page itself did not scroll sideways", await page.evaluate(() => document.querySelector(".admin-content").scrollWidth <= document.querySelector(".admin-content").clientWidth + 1));
  await ctx.close();
}

// ---------------------------------------------------------------- keyboard
{
  console.log("\n# Keyboard (1280x800)");
  const { ctx, page } = await open(1280, 800, "/admin/businesses");
  await page.keyboard.press("Tab");
  check("first Tab stop is the skip link", await page.evaluate(() => document.activeElement?.classList.contains("admin-skip")));
  const skip = await rect(page, ".admin-skip");
  check("skip link visible when focused", skip.top >= 0);
  await page.keyboard.press("Enter");
  check("skip link moves focus to main", await page.evaluate(() => document.activeElement?.id === "main-content"));
  const seen = new Set();
  let reachedGrid = false; let reachedSort = false; let reachedCheck = false;
  for (let i = 0; i < 60; i += 1) {
    await page.keyboard.press("Tab");
    const d = await page.evaluate(() => { const a = document.activeElement; return { key: `${a.tagName}.${a.className}.${a.getAttribute("aria-label") ?? a.textContent?.slice(0, 12)}`, grid: a.getAttribute("role") === "grid", sort: a.classList.contains("dt__sort"), check: !!a.closest(".dt__hcell--check") }; });
    seen.add(d.key); reachedGrid ||= d.grid; reachedSort ||= d.sort; reachedCheck ||= d.check;
    if (reachedGrid && reachedSort && reachedCheck) break;
  }
  check("Tab reaches tabs, toolbar, select-all, sort headers and grid", reachedGrid && reachedSort && reachedCheck, `${seen.size} distinct stops`);
  await page.locator(".dt__scroll").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  check("arrow keys + Space select a row; bulk region appears", await page.locator('[role="region"][aria-label="Bulk actions"]').count() === 1);
  const sortBefore = await page.locator(".dt__hcell[aria-sort]").count();
  await page.locator(".dt__sort", { hasText: "Business" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  check("sorting works from the keyboard", await page.locator('.dt__hcell[aria-sort] .dt__sort', { hasText: "Business" }).count() === 1 && sortBefore >= 1);
  await ctx.close();
}

// ---------------------------------------------------------------- touch targets
for (const [w, h] of [[390, 844], [1280, 800]]) {
  console.log(`\n# Touch targets (${w}x${h})`);
  for (const path of ["/admin", "/admin/applications", "/admin/businesses", "/admin/payments", "/admin/settings", "/nope"]) {
    const { ctx, page } = await open(w, h, path);
    const bad = await page.evaluate(() => {
      const out = [];
      for (const e of document.querySelectorAll("button, a[href], select, input:not([type=hidden]), [role=tab], textarea")) {
        if (e.closest(".overflow__measure") || e.classList.contains("admin-skip")) continue;
        const style = getComputedStyle(e);
        if (style.visibility === "hidden" || !e.getClientRects().length) continue;
        let t = e;
        if (e.matches("input[type=checkbox], input[type=search]")) t = e.closest("label") ?? e;
        const r = t.getBoundingClientRect();
        if (r.width < 43.5 || r.height < 43.5) out.push(`${e.tagName}.${(e.className || "").toString().slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return out;
    });
    check(`${path}: all targets >= 44px`, bad.length === 0, bad.slice(0, 4).join("; "));
    await ctx.close();
  }
}

// ---------------------------------------------------------------- header
for (const [w, h] of [[320, 568], [390, 844], [568, 320], [820, 1180], [1280, 800], [2560, 1440]]) {
  const { ctx, page } = await open(w, h, "/admin/businesses");
  const hd = await page.evaluate(() => {
    const header = document.querySelector(".admin-header");
    const kids = [...header.querySelectorAll(".admin-header__left, .admin-header__right")];
    const tops = kids.map((k) => { const r = k.getBoundingClientRect(); return Math.round((r.top + r.bottom) / 2); });
    const title = document.querySelector(".admin-page-title");
    return { h: header.getBoundingClientRect().height, oneRow: Math.max(...tops) - Math.min(...tops) <= 2, ell: getComputedStyle(title).textOverflow === "ellipsis" && getComputedStyle(title).whiteSpace === "nowrap", over: header.scrollWidth <= header.clientWidth + 1 };
  });
  check(`header ${w}x${h}: single row, ellipsis, no overflow`, hd.h <= 72 && hd.oneRow && hd.ell && hd.over, JSON.stringify(hd));
  await ctx.close();
}

await browser.close();
console.log(`\n${failures ? failures + " FAILED" : "ALL PASSED"}`);
process.exit(failures ? 1 : 0);
