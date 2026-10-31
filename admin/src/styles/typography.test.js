import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Guards the admin type system: every size comes from a token, nothing renders below 13px,
// weights are limited to 400/500/600, and no component hard-codes a size in JS.
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(SRC);
const css = files.filter((f) => f.endsWith(".css"));
const typography = readFileSync(join(SRC, "styles", "typography.css"), "utf8");
// Blank out comments but keep their newlines so reported line numbers stay correct.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));

test("no raw font-size in admin CSS (tokens only; 0 and 100% root are allowed)", () => {
  const bad = [];
  for (const f of css) {
    strip(readFileSync(f, "utf8")).split("\n").forEach((line, i) => {
      for (const m of line.matchAll(/(?<![-\w])font-size\s*:\s*([^;}]+)/g)) {
        const v = m[1].trim();
        const ok = /^var\(--fs-(xs|sm|md|lg|xl|2xl)\)$/.test(v) || v === "0" || (v === "100%" && f.endsWith("typography.css"));
        if (!ok) bad.push(`${relative(SRC, f)}:${i + 1}  font-size: ${v}`);
      }
    });
  }
  assert.deepEqual(bad, []);
});

test("every size token is at least 13px, and the root is 100%", () => {
  const sizes = [...strip(typography).matchAll(/--fs-(xs|sm|md|lg|xl|2xl)\s*:\s*([\d.]+)rem/g)];
  assert.equal(sizes.length, 6, "six --fs-* tokens are defined");
  for (const [, name, rem] of sizes) assert.ok(parseFloat(rem) * 16 >= 13, `--fs-${name} is ${parseFloat(rem) * 16}px`);
  assert.match(strip(typography), /html\s*\{[^}]*font-size:\s*100%/);
});

test("font weights come from the 400/500/600 tokens", () => {
  const bad = [];
  for (const f of css) {
    strip(readFileSync(f, "utf8")).split("\n").forEach((line, i) => {
      for (const m of line.matchAll(/(?<![-\w])font-weight\s*:\s*([^;}]+)/g)) {
        const v = m[1].trim();
        // "100 900" is the variable font's weight axis range inside @font-face, not a text weight.
        if (v === "100 900" && f.endsWith("typography.css")) continue;
        if (!/^var\(--fw-(regular|medium|semibold)\)$/.test(v)) bad.push(`${relative(SRC, f)}:${i + 1}  ${v}`);
      }
    });
  }
  assert.deepEqual(bad, []);
});

test("no JS/JSX hard-codes a font size", () => {
  const bad = files
    .filter((f) => /\.(jsx?|tsx?)$/.test(f) && !/\.test\./.test(f))
    .filter((f) => /fontSize\s*:|font-size\s*:/.test(readFileSync(f, "utf8")))
    .map((f) => relative(SRC, f));
  assert.deepEqual(bad, []);
});

test("Inter is self-hosted: latin woff2 from the package, no remote font URLs", () => {
  assert.match(typography, /@fontsource-variable\/inter\/files\/inter-latin-wght-normal\.woff2/);
  assert.match(typography, /font-display:\s*swap/);
  assert.match(typography, /size-adjust:/);
  const remote = css.filter((f) => /https?:\/\/[^)'"\s]*\.(woff2?|ttf|otf)|fonts\.googleapis|fonts\.gstatic/.test(readFileSync(f, "utf8")));
  assert.deepEqual(remote, []);
  const html = readFileSync(join(SRC, "..", "index.html"), "utf8");
  assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)/);
});
