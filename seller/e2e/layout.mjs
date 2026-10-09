import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright";

const dist = resolve(import.meta.dirname, "../dist");
const out = resolve(import.meta.dirname, "../.layout");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const sizes = [[280, 640], [360, 740], [768, 1024], [1024, 768], [1440, 900], [2560, 1440], [740, 360]];
const themes = ["light", "dark"];

const serve = () =>
  new Promise((done) => {
    const server = createServer((req, res) => {
      const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
      let file = join(dist, path);
      if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, "index.html");
      res.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream" });
      res.end(readFileSync(file));
    });
    server.listen(0, "127.0.0.1", () => done({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }));
  });

const overflow = (page) => page.evaluate(() => ({ doc: document.documentElement.scrollWidth - window.innerWidth, body: document.body.scrollWidth - window.innerWidth, content: (() => { const c = document.querySelector('[data-testid="content"]'); return c ? c.scrollWidth - c.clientWidth : 0; })() }));

const failures = [];
const check = (name, ok, detail = "") => {
  if (!ok) failures.push(`${name} ${detail}`);
};

mkdirSync(out, { recursive: true });
const server = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

for (const theme of themes) {
  for (const [w, h] of sizes) {
    const tag = `${w}x${h}-${theme}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, deviceScaleFactor: 1 });
    await ctx.addInitScript((t) => { try { localStorage.setItem("epicmkt-seller-theme", t); } catch (e) {} }, theme);
    const page = await ctx.newPage();
    await page.goto(`${server.url}/login`);
    await page.waitForSelector("h1");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    check(`${tag} login bg`, theme === "dark" ? bg === "rgb(15, 15, 16)" : bg === "rgb(243, 244, 246)", bg);
    let o = await overflow(page);
    check(`${tag} login overflow`, o.doc <= 0 && o.body <= 0, JSON.stringify(o));
    await page.screenshot({ path: join(out, `${tag}-login.png`) });

    await page.fill('input[autocomplete="username"]', "es100002");
    await page.fill('input[autocomplete="current-password"]', "Demo-Passw0rd");
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="header"]');
    await page.waitForTimeout(1200);
    o = await overflow(page);
    check(`${tag} dashboard overflow`, o.doc <= 0 && o.body <= 0 && o.content <= 0, JSON.stringify(o));
    await page.screenshot({ path: join(out, `${tag}-dashboard.png`) });

    const scrolled = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="content"]');
      c.scrollTop = 600;
      const r = document.querySelector('[data-testid="header"]').getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, scrollTop: c.scrollTop, docScroll: window.scrollY, h: window.innerHeight, shell: document.documentElement.scrollHeight - window.innerHeight };
    });
    check(`${tag} header sticky`, scrolled.top === 0 && scrolled.bottom > 0 && scrolled.docScroll === 0 && scrolled.shell <= 0, JSON.stringify(scrolled));
    check(`${tag} content scrolls`, scrolled.scrollTop > 0, JSON.stringify(scrolled));

    const nav = await page.evaluate(() => {
      const vis = (sel) => { const e = document.querySelector(sel); return !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0; };
      const side = document.querySelector('aside[aria-label="Sidebar"]');
      return { sidebar: vis('aside[aria-label="Sidebar"]'), sidebarW: side ? Math.round(side.getBoundingClientRect().width) : 0, bottom: vis('nav[aria-label="Primary"]'), burger: vis('button[aria-label="Open menu"]') };
    });
    const shortLandscape = w > h && h < 500;
    const want = shortLandscape ? { sidebar: false, bottom: false, burger: true } : w < 768 ? { sidebar: false, bottom: true, burger: true } : { sidebar: true, bottom: false, burger: false };
    check(`${tag} nav mode`, nav.sidebar === want.sidebar && nav.bottom === want.bottom && nav.burger === want.burger, JSON.stringify(nav));
    if (w >= 1024 && !shortLandscape) check(`${tag} sidebar width`, nav.sidebarW === 272 || nav.sidebarW === 80 + 0, String(nav.sidebarW));
    if (w >= 768 && w < 1024) check(`${tag} rail width`, nav.sidebarW === 80, String(nav.sidebarW));
    if (w >= 1024 && !shortLandscape) {
      await page.keyboard.press("[");
      const width = () => page.evaluate(() => Math.round(document.querySelector('aside[aria-label="Sidebar"]').getBoundingClientRect().width));
      const collapsedW = await width();
      await page.reload();
      await page.waitForSelector('[data-testid="header"]');
      check(`${tag} collapse remembered`, collapsedW === 80 && (await width()) === 80, String(collapsedW));
      await page.keyboard.press("[");
      check(`${tag} expand`, (await width()) === 272);
    }
    await ctx.close();
  }
}

await browser.close();
server.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`layout ok: ${sizes.length * themes.length} runs`);
