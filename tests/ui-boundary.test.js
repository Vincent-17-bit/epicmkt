import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import react from "@vitejs/plugin-react";
import { build } from "vite";

const root = resolve(import.meta.dirname, "..");
const eslint = new ESLint({ cwd: root });
const lint = async (code) => {
  const [result] = await eslint.lintText(code, { filePath: join(root, "ui/src/components/Probe.jsx") });
  return result.messages.filter((m) => m.ruleId === "no-restricted-imports");
};

describe("@epicmkt/ui import boundary", () => {
  it("passes on the current source", async () => {
    const results = await eslint.lintFiles(["ui/src"]);
    const errors = results.flatMap((r) => r.messages.filter((m) => m.severity === 2));
    expect(errors).toEqual([]);
  });

  it.each([
    ["../../../client/src/api/index.js", "client"],
    ["../../../seller/src/api/index.js", "seller"],
    ["../../../admin/src/api/index.js", "admin"],
    ["@supabase/supabase-js", "supabase"],
    ["react-router-dom", "router"],
    ["zustand", "store"],
    ["@tanstack/react-query", "query"]
  ])("fails on import of %s", async (spec) => {
    const messages = await lint(`import x from "${spec}";\nexport default x;\n`);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("does not know about sellers, admin or Supabase in its source", () => {
    const walk = (dir) =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
    const files = walk(join(root, "ui/src")).filter((f) => /\.(jsx?|css)$/.test(f) && !/\.test\./.test(f) && !/test\//.test(f));
    const text = files.map((f) => readFileSync(f, "utf8")).join("\n").toLowerCase();
    for (const word of ["supabase", "seller", "admin"]) expect(text).not.toContain(word);
  });
});

describe("@epicmkt/ui tree-shaking", () => {
  const out = mkdtempSync(join(tmpdir(), "epicmkt-shake-"));
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  it("drops unused components when only Button is imported", async () => {
    await build({
      root: join(root, "tests/treeshake"),
      logLevel: "silent",
      plugins: [react()],
      build: {
        outDir: out,
        emptyOutDir: true,
        minify: false,
        lib: { entry: "entry.js", formats: ["es"], fileName: "out" },
        rollupOptions: { external: [/^react/, /^@fortawesome/] }
      }
    });
    const files = readdirSync(out);
    const js = readFileSync(join(out, files.find((f) => f.endsWith(".js"))), "utf8");
    const css = files.filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(out, f), "utf8")).join("");
    for (const marker of ["Services and prices", "Report a problem", "We could not load this business", "Opening hours", "Photo gallery", "quick-actions"]) {
      expect(js).not.toContain(marker);
    }
    for (const cls of ["hours", "sheet", "lightbox", "overlay", "quickActions"]) expect(css).not.toContain(cls);
    expect(css).toContain("btn");
  });
});
