// WCAG 2.x contrast maths and the list of token pairs the admin app is audited on. Pure: no DOM, no React.
// Used by scripts/contrast-audit.mjs (writes docs/admin-contrast.md) and src/theme/contrast.ui.test.js (fails the build).

export function parseTokens(css, theme) {
  const block = css.match(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`))[1];
  const out = {};
  for (const [, k, v] of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[k] = v.trim();
  return out;
}

// "#rrggbb" or "rgb(r g b / a)", composited over `under` (an [r,g,b]) when it has alpha.
export function toRgb(value, under = [255, 255, 255]) {
  let m = value.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = value.match(/^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/);
  if (m) {
    const a = m[4] === undefined ? 1 : Number(m[4]);
    return [1, 2, 3].map((i, k) => Math.round(Number(m[i]) * a + under[k] * (1 - a)));
  }
  throw new Error(`unparsed colour ${value}`);
}

const channel = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
export function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// kind: "text" needs 4.5:1 (1.4.3), "ui" needs 3:1 (1.4.11 UI components, graphical objects, focus indicators 2.4.11).
// `over` names the opaque surface a translucent background sits on.
const T = "text", U = "ui";
export const PAIRS = [
  ["text", "bg", T], ["text", "surface", T], ["text", "surface-raised", T], ["text", "surface-sunken", T],
  ["text-muted", "bg", T], ["text-muted", "surface", T], ["text-muted", "surface-raised", T], ["text-muted", "surface-sunken", T],
  ["text-muted", "neutral-tint", T, "surface"], ["text-muted", "primary-tint", T, "surface"], ["text-muted", "table-head", T, "surface"],
  ["primary-text", "surface", T], ["primary-text", "bg", T], ["primary-text", "surface-raised", T], ["primary-text", "primary-tint", T, "surface"],
  ["on-primary", "primary", T], ["on-primary", "primary-strong", T],
  ["on-danger", "danger", T], ["on-success", "success-solid", T], ["on-warning", "warning-solid", T],
  ["danger", "surface", T], ["danger", "bg", T], ["danger", "surface-raised", T], ["danger", "danger-tint", T, "surface"],
  ["success", "surface", T], ["success", "bg", T], ["success", "success-tint", T, "surface"],
  ["warning", "surface", T], ["warning", "bg", T], ["warning", "warning-tint", T, "surface"],
  ["text", "warning-tint", T, "surface"], ["text", "primary-tint", T, "surface"], ["text", "danger-tint", T, "surface"], ["text", "neutral-tint", T, "surface"],
  ["toast-text", "toast-bg", T],
  ["sidebar-text", "sidebar-bg", T], ["sidebar-text-muted", "sidebar-bg", T], ["sidebar-text-active", "sidebar-bg", T],
  ["sidebar-text-active", "sidebar-active", T, "sidebar-bg"], ["sidebar-text", "sidebar-hover", T, "sidebar-bg"], ["sidebar-text-muted", "sidebar-hover", T, "sidebar-bg"],
  ["primary-text", "sidebar-bg", T],
  // Non-text: focus ring (the ring colour is --primary-text) against every surface it can appear on, form-field borders, icons and chart marks.
  ["primary-text", "surface", U, null, "focus ring on surface"], ["primary-text", "bg", U, null, "focus ring on page"],
  ["primary-text", "surface-raised", U, null, "focus ring on raised surface"], ["primary-text", "sidebar-bg", U, null, "focus ring on sidebar"],
  ["primary-text", "primary-tint", U, null, "focus ring on tinted row"], ["primary-text", "sidebar-active", U, "sidebar-bg", "focus ring on active nav item"],
  ["border-control", "surface", U, null, "form field border"], ["border-control", "surface-raised", U, null, "form field border in a dialog"],
  ["border-control", "bg", U, null, "form field border on the page"], ["border-control", "surface-sunken", U, null, "form field border on a sunken surface"],
  ["tick-green", "surface", U, null, "delivered tick"], ["tick-blue", "surface", U, null, "read tick"],
  ["chart-fill", "surface", U, null, "chart bar / sparkline"],
];

export function audit(css, theme) {
  const t = parseTokens(css, theme);
  const opaque = (name) => toRgb(t[name], [0, 0, 0]);
  return PAIRS.map(([fg, bg, kind, over, note]) => {
    const under = over ? opaque(over) : opaque("surface");
    const bgc = toRgb(t[bg], under);
    const fgc = toRgb(t[fg], bgc);
    const r = ratio(fgc, bgc);
    const min = kind === "text" ? 4.5 : 3;
    return { theme, fg, bg, kind, note: note ?? "", ratio: r, min, pass: r >= min };
  });
}
