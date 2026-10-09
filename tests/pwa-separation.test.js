import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";

const root = resolve(import.meta.dirname, "..");
const out = mkdtempSync(join(tmpdir(), "epicmkt-pwa-"));
const apps = {};

const readManifest = (dir) => {
  const file = readdirSync(dir).find((f) => f.endsWith(".webmanifest"));
  return { file, manifest: JSON.parse(readFileSync(join(dir, file), "utf8")) };
};

const bundleText = (dir) => {
  const files = [join(dir, "index.html")];
  const reg = join(dir, "registerSW.js");
  if (existsSync(reg)) files.push(reg);
  const assets = join(dir, "assets");
  if (existsSync(assets)) readdirSync(assets).filter((f) => f.endsWith(".js")).forEach((f) => files.push(join(assets, f)));
  return files.map((f) => readFileSync(f, "utf8")).join("\n");
};

const swFiles = (dir) => readdirSync(dir).filter((f) => /^(sw|seller-sw|admin-sw)\.js$/.test(f));

beforeAll(async () => {
  for (const name of ["client", "seller", "admin"]) {
    const outDir = join(out, name);
    process.env.VITE_BASE_PATH = "";
    await build({ root: join(root, name), logLevel: "silent", build: { outDir, emptyOutDir: true } });
    apps[name] = { outDir, ...readManifest(outDir), sw: swFiles(outDir) };
  }
  const sub = join(out, "seller-sub");
  process.env.VITE_BASE_PATH = "/business";
  await build({ root: join(root, "seller"), logLevel: "silent", build: { outDir: sub, emptyOutDir: true } });
  apps.sellerSub = { outDir: sub, ...readManifest(sub), sw: swFiles(sub) };
  delete process.env.VITE_BASE_PATH;
});

afterAll(() => rmSync(out, { recursive: true, force: true }));

describe("PWA separation", () => {
  it("gives each app its own manifest file, name and id", () => {
    const files = ["client", "seller", "admin"].map((n) => apps[n].file);
    const names = ["client", "seller", "admin"].map((n) => apps[n].manifest.name);
    expect(new Set(files).size).toBe(3);
    expect(new Set(names).size).toBe(3);
    expect(apps.seller.manifest.id).not.toBe(apps.admin.manifest.id);
  });

  it("gives each app its own service worker file", () => {
    const sws = ["client", "seller", "admin"].map((n) => apps[n].sw);
    sws.forEach((list) => expect(list).toHaveLength(1));
    expect(new Set(sws.flat()).size).toBe(3);
  });

  it("keeps start_url inside scope for every app", () => {
    for (const n of ["client", "seller", "admin", "sellerSub"]) {
      const { start_url, scope } = apps[n].manifest;
      expect(start_url.startsWith(scope)).toBe(true);
    }
  });

  it("scopes the seller app to /business/ when built with that base", () => {
    expect(apps.sellerSub.manifest.scope).toBe("/business/");
    expect(apps.sellerSub.manifest.start_url).toBe("/business/");
    expect(apps.seller.manifest.scope).toBe("/");
  });

  it("registers each service worker only from its own app output", () => {
    for (const n of ["client", "seller", "admin"]) {
      const text = bundleText(apps[n].outDir);
      const own = apps[n].sw[0].replace(".", "\\.");
      expect(text).toMatch(new RegExp(`(?<![\\w-])${own}`));
      for (const other of ["seller-sw.js", "admin-sw.js", "sw.js"].filter((f) => f !== apps[n].sw[0])) {
        expect(text).not.toMatch(new RegExp(`(?<![\\w-])${other.replace(".", "\\.")}`));
      }
    }
  });
});
