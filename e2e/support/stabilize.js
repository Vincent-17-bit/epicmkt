import { FIXED_TIME, HOST, SEED } from "./env.js";

const EMPTY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';

const seedRandom = (seed) => {
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
    sessionStorage.setItem("epicmkt-rotation", String(seed));
  } catch {}
};

const isLocal = (url) => {
  try {
    const { hostname } = new URL(url);
    return hostname === HOST || hostname === "localhost";
  } catch {
    return false;
  }
};

export async function prepare(page) {
  await page.clock.setFixedTime(new Date(FIXED_TIME));
  await page.addInitScript(seedRandom, SEED);
  await page.route(
    (url) => /^https?:$/.test(url.protocol) && !isLocal(url.href),
    (route) => {
      const type = route.request().resourceType();
      if (type === "image") return route.fulfill({ status: 200, contentType: "image/svg+xml", body: EMPTY_SVG });
      return route.fulfill({ status: 204, body: "" });
    }
  );
}

export function watch(page) {
  const issues = [];
  const favicon = (url) => /\/favicon\.[a-z]+$/.test(new URL(url).pathname);
  page.on("pageerror", (error) => issues.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (message.text().startsWith("Failed to load resource")) return;
    issues.push(`console.error: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    const reason = request.failure()?.errorText ?? "failed";
    if (!isLocal(request.url()) || favicon(request.url()) || reason.includes("ERR_ABORTED")) return;
    issues.push(`requestfailed: ${request.url()} (${reason})`);
  });
  page.on("response", (response) => {
    if (!isLocal(response.url()) || favicon(response.url()) || response.status() < 400) return;
    issues.push(`http ${response.status()}: ${response.url()}`);
  });
  return issues;
}

export async function quiesce(page, quiet = 700, max = 8000) {
  await page.evaluate(
    ({ quiet, max }) =>
      new Promise((resolve) => {
        let timer;
        const finish = () => {
          observer.disconnect();
          resolve();
        };
        const observer = new MutationObserver(() => {
          clearTimeout(timer);
          timer = setTimeout(finish, quiet);
        });
        observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
        timer = setTimeout(finish, quiet);
        setTimeout(finish, max);
      }),
    { quiet, max }
  );
}

export async function settle(page) {
  await page.waitForLoadState("networkidle");
  await quiesce(page);
  await page.evaluate(async () => {
    const within = (promise, ms) => Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
    for (const image of document.images) image.loading = "eager";
    await within(document.fonts.ready, 5000);
    await within(Promise.all([...document.images].map((image) => (image.complete ? null : image.decode().catch(() => null)))), 5000);
  });
}

const overflow = (page) =>
  page.evaluate(() => {
    let extra = document.documentElement.scrollHeight - innerHeight;
    for (const element of document.querySelectorAll("body *")) {
      if (!/(auto|scroll)/.test(getComputedStyle(element).overflowY)) continue;
      const delta = element.scrollHeight - element.clientHeight;
      if (delta > 1 && element.clientHeight > innerHeight * 0.4) extra = Math.max(extra, delta);
    }
    return Math.ceil(extra);
  });

export async function expand(page) {
  const limit = 15000;
  for (let pass = 0; pass < 4; pass++) {
    const extra = await overflow(page);
    if (extra <= 1) break;
    const { width, height } = page.viewportSize();
    await page.setViewportSize({ width, height: Math.min(height + extra, limit) });
    await settle(page);
  }
}
