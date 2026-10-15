import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const shared = read("../../../shared/src/tokens.css");
const admin = read("./tokens.css");

// ---- a tiny parser: enough for flat custom-property blocks ----------------------------------
const stripAtRules = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@media[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");

function blocks(css) {
  const out = [];
  for (const m of stripAtRules(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const vars = {};
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[d[1]] = d[2].trim();
    out.push({ selectors: m[1].split(",").map((s) => s.trim()), vars });
  }
  return out;
}

function theme(css, name) {
  const sel = name === "dark" ? ['[data-theme="dark"]'] : [":root", '[data-theme="light"]'];
  const merged = {};
  for (const b of blocks(css)) if (b.selectors.some((s) => sel.includes(s))) Object.assign(merged, b.vars);
  return merged;
}

const themes = (() => {
  const make = (name) => {
    const light = { ...theme(shared, "light"), ...theme(admin, "light") };
    return name === "light" ? light : { ...light, ...theme(shared, "dark"), ...theme(admin, "dark") };
  };
  return { light: make("light"), dark: make("dark") };
})();

// ---- colour maths ---------------------------------------------------------------------------
function parse(value, vars) {
  const v = value.trim();
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  if (ref) return parse(vars[ref[1]], vars);
  let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  m = v.match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+))?\s*\)$/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  throw new Error(`Cannot parse colour: ${value}`);
}

const over = (top, base) => ({
  r: top.r * top.a + base.r * (1 - top.a),
  g: top.g * top.a + base.g * (1 - top.a),
  b: top.b * top.a + base.b * (1 - top.a),
  a: 1,
});

const lum = ({ r, g, b }) => {
  const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

function ratio(vars, fgName, bgName, baseName) {
  const base = parse(vars[baseName], vars);
  const bg = over(parse(vars[bgName], vars), base);
  const fg = over(parse(vars[fgName], vars), bg);
  const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const TONES = ["success", "warning", "danger", "info", "neutral"];
const SURFACES = ["--surface", "--bg", "--surface-2"];

describe("admin tokens", () => {
  it("define every themed token in both themes", () => {
    const themed = (sel) =>
      Object.keys(Object.assign({}, ...blocks(admin).filter((b) => b.selectors.includes(sel)).map((b) => b.vars))).sort();
    const light = themed('[data-theme="light"]');
    expect(light.length).toBeGreaterThan(40);
    expect(themed('[data-theme="dark"]')).toEqual(light);
  });

  it("measures contrast correctly", () => {
    const vars = { "--a": "#000000", "--b": "#ffffff", "--c": "#38b6ff", "--d": "rgb(0 0 0 / 0.5)" };
    expect(ratio(vars, "--a", "--b", "--b")).toBeCloseTo(21, 0);
    expect(ratio(vars, "--c", "--b", "--b")).toBeLessThan(3); // the brand blue is not text-safe on white
    expect(ratio(vars, "--b", "--d", "--b")).toBeGreaterThan(3); // alpha is composited over the base first
  });

  for (const name of ["light", "dark"]) {
    describe(`${name} theme contrast`, () => {
      const vars = themes[name];
      const check = (label, fg, bg, base, min) =>
        it(`${label} (${fg} on ${bg}${base !== bg ? ` over ${base}` : ""}) is at least ${min}:1`, () => {
          expect(ratio(vars, fg, bg, base)).toBeGreaterThanOrEqual(min);
        });

      for (const t of TONES) {
        for (const s of SURFACES) check(`${t} chip text`, `--tone-${t}-fg`, `--tone-${t}-bg`, s, 4.5);
        check(`${t} solid fill text`, `--tone-${t}-on-solid`, `--tone-${t}-solid`, "--surface", 4.5);
        for (const s of SURFACES) check(`${t} icon`, `--tone-${t}-solid`, s, s, 3);
      }

      check("danger button text", "--on-danger", "--danger", "--surface", 4.5);
      check("danger button against page", "--danger", "--surface", "--surface", 3);
      check("selected row text", "--on-selected", "--selected-bg", "--surface", 4.5);
      check("body text on hover", "--text", "--hover-tint", "--surface", 4.5);
      check("muted text on hover", "--text-muted", "--hover-tint", "--surface", 4.5);
      check("muted text on surface", "--text-muted", "--surface", "--surface", 4.5);
      check("placeholder", "--field-placeholder", "--field-bg", "--field-bg", 4.5);
      check("field border on field", "--field-border", "--field-bg", "--field-bg", 3);
      check("field border on surface", "--field-border", "--surface", "--surface", 3);
      check("toast text", "--toast-fg", "--toast-bg", "--toast-bg", 4.5);
      check("toast secondary text", "--toast-muted", "--toast-bg", "--toast-bg", 4.5);
      check("toast action", "--toast-action", "--toast-bg", "--toast-bg", 4.5);
      for (const t of ["success", "warning", "danger", "info"]) check(`toast ${t} icon`, `--toast-tone-${t}`, "--toast-bg", "--toast-bg", 3);
      check("primary button text", "--on-primary", "--primary", "--surface", 4.5);
      check("primary button text (hover)", "--on-primary", "--primary-hover", "--surface", 4.5);
      check("primary button text (pressed)", "--on-primary", "--primary-pressed", "--surface", 4.5);
      check("disabled text", "--disabled-fg", "--disabled-bg", "--disabled-bg", 3);
      check("focus ring against surface", "--focus-ring", "--surface", "--surface", 1.5);

      for (let i = 1; i <= 6; i++) check(`chart series ${i}`, `--chart-${i}`, "--surface", "--surface", 3);
    });
  }
});
