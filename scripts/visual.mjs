import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const root = resolve(import.meta.dirname, "..");
const work = join(root, ".visual");
const baseRef = process.env.VISUAL_BASE_REF ?? "origin/main";
const slug = process.env.VISUAL_SLUG ?? "fade-kings-barbershop";
const widths = [360, 768, 1280];
const themes = ["light", "dark"];
const fixedNow = new Date("2026-03-04T09:00:00+03:00");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json", ".webmanifest": "application/manifest+json" };

const sh = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed`);
};

const serve = (dir) =>
  new Promise((done) => {
    const server = createServer((req, res) => {
      const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
      let file = join(dir, path);
      if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) file = join(dir, "index.html");
      res.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream" });
      res.end(readFileSync(file));
    });
    server.listen(Number(process.env.VISUAL_PORT ?? 4789), "127.0.0.1", () => done({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }));
  });

const capture = async (dist, dest) => {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const server = await serve(dist);
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: (process.env.CHROMIUM_ARGS ?? "--no-sandbox").split(" ").filter(Boolean)
  });
  try {
    for (const theme of themes) {
      for (const width of widths) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, reducedMotion: "reduce", deviceScaleFactor: 1, locale: "en-KE", timezoneId: "Africa/Nairobi", serviceWorkers: "block" });
        await context.addInitScript((value) => {
          try {
            localStorage.setItem("epicmkt-theme", value);
          } catch {}
        }, theme);
        await context.addInitScript(() => {
          let seed = 123456789;
          Math.random = () => {
            seed = (seed + 0x6d2b79f5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
          };
        });
        await context.route(/openstreetmap\.org/, (route) => route.fulfill({ contentType: "text/html", body: "<body style='margin:0;background:#cfd8dc'></body>" }));
        const page = await context.newPage();
        await page.clock.setFixedTime(fixedNow);
        await page.goto(`${server.url}/b/${slug}`);
        await page.waitForSelector("article h1");
        await page.waitForLoadState("networkidle");
        await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}" });
        await page.evaluate(async () => {
          await document.fonts.ready;
          [...document.images].forEach((img) => {
            img.loading = "eager";
            img.decoding = "sync";
          });
          await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((ok) => ((img.onload = ok), (img.onerror = ok))))));
        });
        const measure = () => page.evaluate(() => Math.min(9000, Math.max(...[...document.querySelectorAll("html, body, body *")].map((el) => el.scrollHeight))));
        let height = await measure();
        for (let stable = 0, tries = 0; stable < 6 && tries < 80; tries++) {
          await page.waitForTimeout(250);
          const next = await measure();
          stable = next === height ? stable + 1 : 0;
          height = next;
        }
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(300);
        await page.screenshot({ path: join(dest, `${theme}-${width}.png`) });
        await context.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
};

const compare = (a, b) => {
  const diffDir = join(work, "diff");
  rmSync(diffDir, { recursive: true, force: true });
  mkdirSync(diffDir, { recursive: true });
  let failed = 0;
  for (const name of readdirSync(a).filter((f) => f.endsWith(".png")).sort()) {
    if (!existsSync(join(b, name))) {
      console.log(`MISSING  ${name}`);
      failed++;
      continue;
    }
    const x = PNG.sync.read(readFileSync(join(a, name)));
    const y = PNG.sync.read(readFileSync(join(b, name)));
    if (x.width !== y.width || x.height !== y.height) {
      console.log(`SIZE     ${name}  ${x.width}x${x.height} -> ${y.width}x${y.height}`);
      failed++;
      continue;
    }
    const diff = new PNG({ width: x.width, height: x.height });
    const count = pixelmatch(x.data, y.data, diff.data, x.width, x.height, { threshold: 0 });
    if (count) {
      writeFileSync(join(diffDir, name), PNG.sync.write(diff));
      console.log(`DIFF     ${name}  ${count} px`);
      failed++;
    } else {
      console.log(`IDENTICAL ${name}  ${x.width}x${x.height}`);
    }
  }
  return failed;
};

const build = (src) => sh("npm", ["run", "build", "-w", "client"], src);

const prepareBase = () => {
  if (process.env.VISUAL_BASE_SRC) return process.env.VISUAL_BASE_SRC;
  const dir = join(work, "base-src");
  spawnSync("git", ["worktree", "remove", "--force", dir], { cwd: root, stdio: "ignore" });
  rmSync(dir, { recursive: true, force: true });
  sh("git", ["worktree", "add", "--detach", dir, baseRef], root);
  sh("npm", ["ci"], dir);
  return dir;
};

const [command = "run", first, second] = process.argv.slice(2);

if (command === "capture") {
  await capture(resolve(first), resolve(second));
} else if (command === "compare") {
  process.exit(compare(resolve(first), resolve(second)) ? 1 : 0);
} else {
  const baseSrc = prepareBase();
  build(baseSrc);
  await capture(join(baseSrc, "client/dist"), join(work, "base"));
  build(root);
  await capture(join(root, "client/dist"), join(work, "head"));
  const failed = compare(join(work, "base"), join(work, "head"));
  console.log(failed ? `\nVISUAL REGRESSION: ${failed} screenshot(s) differ from ${baseRef}` : `\nVisual check passed: all screenshots identical to ${baseRef}`);
  process.exit(failed ? 1 : 0);
}
