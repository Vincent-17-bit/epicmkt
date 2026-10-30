import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(process.cwd(), "src/styles/theme.css"), "utf8");
const block = (name) => css.match(new RegExp(`\\[data-theme="${name}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`))[1];

function tokens(name) {
  const out = {};
  for (const [, k, v] of block(name).matchAll(/--([a-z-]+):\s*([^;]+);/g)) out[k] = v.trim();
  return out;
}
function rgb(value, bg) {
  let m = value.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = value.match(/^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/);
  if (m) {
    const a = m[4] === undefined ? 1 : Number(m[4]);
    return [1, 2, 3].map((i, k) => Math.round(Number(m[i]) * a + bg[k] * (1 - a)));
  }
  throw new Error(`unparsed colour ${value}`);
}
const lum = ([r, g, b]) => {
  const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [foreground token, background token]
const pairs = [
  ["text", "bg"], ["text", "surface"], ["text", "surface-raised"],
  ["text-muted", "bg"], ["text-muted", "surface"], ["text-muted", "surface-raised"],
  ["primary-text", "surface"], ["primary-text", "bg"], ["primary-text", "primary-tint"],
  ["on-primary", "primary"], ["on-danger", "danger"], ["on-success", "success-solid"],
  ["on-warning", "warning-solid"], ["danger", "surface"], ["danger", "bg"],
  ["success", "surface"], ["warning", "surface"], ["text", "warning-tint"],
  ["text", "primary-tint"], ["text", "danger-tint"], ["text", "neutral-tint"],
  ["toast-text", "toast-bg"], ["sidebar-text", "sidebar-bg"], ["sidebar-text-muted", "sidebar-bg"],
  ["sidebar-text-active", "sidebar-bg"], ["sidebar-text-active", "sidebar-active"],
  ["sidebar-text", "sidebar-hover"], ["primary-text", "sidebar-bg"],
];

describe.each(["light", "dark"])("WCAG AA contrast (%s)", (name) => {
  const t = tokens(name);
  const page = rgb(t.surface, [0, 0, 0]);
  it.each(pairs)("%s on %s >= 4.5:1", (fg, bgName) => {
    const base = bgName === "sidebar-bg" || bgName.startsWith("sidebar-") ? rgb(t["sidebar-bg"], [0, 0, 0]) : page;
    const bg = rgb(t[bgName], base);
    const fgc = rgb(t[fg], bg);
    expect(ratio(fgc, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
