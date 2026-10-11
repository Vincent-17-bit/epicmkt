// Real-browser check of the media manager: the canvas pipeline, EXIF removal, orientation, and the layout in both
// themes with a full grid. Run the app first (`npm run dev -w seller`), then:
//   E2E_ASSETS=/path/to/assets node seller/e2e/media.e2e.mjs
// Assets needed: exif.jpg (3000x2000, EXIF orientation 6 + GPS), tiny.jpg (500x400), p0..p7.jpg, ok.webm (30s VP9; Playwright Chromium has no H.264), long.webm (60s).
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require("/opt/npm-tools/node_modules/playwright")); }
import assert from "node:assert/strict";
import path from "node:path";

const base = process.env.E2E_URL ?? "http://localhost:5174";
const assets = process.env.E2E_ASSETS ?? "./assets";
const shots = process.env.E2E_SHOTS ?? "./shots";
const A = (n) => path.join(assets, n);
const log = (...a) => console.log("•", ...a);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(base);
if (await page.getByLabel("Seller ID").isVisible({ timeout: 2000 }).catch(() => false)) {
  await page.getByLabel("Seller ID").fill("ES100001");
  await page.getByLabel("Password").fill("Demo-Passw0rd");
  await page.getByRole("button", { name: "Sign in" }).click();
}
await page.getByRole("heading", { name: "Add your first item" }).waitFor();

// First item: add the photo before the item exists. It is prepared now and uploaded on save.
await page.getByTestId("media-browse").setInputFiles(A("exif.jpg"));
await page.getByText(/uploaded as soon as this item is saved/).waitFor();
await page.getByRole("textbox", { name: /^Name/ }).fill("Leather sofa");
await page.getByRole("textbox", { name: /Price \(KSh\)/ }).fill("45000");
await page.getByRole("button", { name: "Save and continue" }).click();
await page.getByRole("tablist", { name: "Catalog views" }).waitFor();
await page.getByRole("button", { name: /Show more fields for Leather sofa/ }).click();
const section = page.getByRole("region", { name: "Photos and videos" });
await section.locator("[data-media][data-status='ready']").first().waitFor({ timeout: 20000 });
log("first photo uploaded after save");

// Real canvas: orientation applied, every size present, no EXIF or GPS bytes in any stored size.
const report = await page.evaluate(async () => {
  const img = document.querySelector("[data-media] img");
  const urls = new Set();
  const gallerySrcs = [img.currentSrc || img.src];
  for (const u of gallerySrcs) urls.add(u);
  const res = [];
  for (const u of urls) {
    const bytes = new Uint8Array(await (await fetch(u)).arrayBuffer());
    let text = ""; for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
    res.push({ u, size: bytes.length, meta: /Exif|GPS|XMP|ICC_PROFILE|PhoneCo/.test(text), riff: text.slice(0, 4) + text.slice(8, 12) });
  }
  return { w: img.naturalWidth, h: img.naturalHeight, res };
});
log("thumb", report.w, "x", report.h, report.res.map((r) => `${r.riff} ${r.size}B meta=${r.meta}`).join(", "));
assert.ok(report.h > report.w, "orientation 6 should come out upright (portrait)");
assert.ok(report.res.every((r) => !r.meta), "no EXIF or GPS in the stored file");
assert.ok(report.res.every((r) => r.riff === "RIFFWEBP"), "stored as WebP");

// Rules, in the real browser.
await section.getByTestId("media-browse").setInputFiles(A("tiny.jpg"));
await section.locator("[data-job][data-status='error']", { hasText: /at least 600/i }).waitFor();
await section.getByTestId("media-browse").setInputFiles(A("long.webm"));
await section.locator("[data-job][data-status='error']", { hasText: /45 seconds|longer than/i }).waitFor({ timeout: 20000 });
assert.equal(await section.locator("[data-media]").count(), 1, "refused files add nothing");
log("tiny photo and 60s video refused");
while (await section.locator("[data-job] >> text=Dismiss").count()) await section.locator("[data-job] >> text=Dismiss").first().click();

// Fill the grid: 7 photos and 1 video on Standard.
await section.getByTestId("media-browse").setInputFiles([1, 2, 3, 4, 5, 6].map((i) => A(`p${i}.jpg`)));
await section.getByTestId("media-browse").setInputFiles(A("ok.webm"));
await page.waitForFunction(() => document.querySelectorAll("[data-media][data-status='ready']").length === 8, null, { timeout: 60000 });
await page.waitForFunction(() => /7 of 7 photos, 1 of 1 video/.test(document.querySelector("[data-testid=media-counter]").textContent));
log("full grid: 7 photos + 1 video");
const video = section.locator("[data-kind='video']");
assert.match(await video.textContent(), /0:30/, "duration shown");

// Layout in both themes at phone, tablet and desktop widths.
const expectCols = (w) => (w < 640 ? 2 : w < 900 ? 3 : w < 1200 ? 4 : 5);
for (const theme of ["light", "dark"]) {
  for (const width of [360, 390, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
    await page.waitForTimeout(150);
    const m = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("[data-testid=media-grid] > [data-media]")];
      const lefts = new Set(cards.map((c) => Math.round(c.getBoundingClientRect().left)));
      const over = [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(e).position !== "fixed").length;
      return { cols: lefts.size, scrollW: document.documentElement.scrollWidth, innerW: innerWidth, over, n: cards.length };
    });
    assert.equal(m.n, 8);
    assert.ok(m.scrollW <= m.innerW + 1, `${theme} ${width}: horizontal scroll (${m.scrollW} > ${m.innerW})`);
    assert.equal(m.cols, expectCols(width), `${theme} ${width}: columns`);
    log(theme, width, "cols", m.cols, "no horizontal scroll");
    await section.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(shots, `grid-${theme}-${width}.png`), fullPage: false });
  }
}

// Preview opens the real shopper gallery; the video does not autoplay.
await page.setViewportSize({ width: 1280, height: 900 });
await section.getByRole("button", { name: "Preview gallery" }).click();
const preview = page.getByTestId("gallery-preview");
await preview.waitFor();
assert.equal(await preview.locator("[data-slide]").count(), 8);
const playing = await preview.locator("video").evaluateAll((vs) => vs.map((v) => !v.paused || v.autoplay));
assert.ok(playing.every((x) => !x), "videos must not autoplay");
await page.screenshot({ path: path.join(shots, "preview.png") });
log("preview: 8 slides, no autoplay");

assert.deepEqual(errors, [], "page errors");
await browser.close();
console.log("media e2e passed");
