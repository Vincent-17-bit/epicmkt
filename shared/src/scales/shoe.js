import { defineScale } from "./define.js";
import { SHOE_CHART } from "./shoeChart.js";
import { fail, interpolate, isMultiple, norm, num2str, ok, roundTo, toHalf } from "./util.js";

const FIELD = { eu: "eu", uk: "uk", "us-m": "usM", "us-w": "usW" };
const WIDTH_LABEL = { narrow: "Narrow", regular: "Regular", wide: "Wide", "extra-wide": "Extra wide" };
const WIDTH_WORDS = [
  ["extra-wide", /(?:extra[\s-]?wide|xw|4e)/], ["wide", /(?:wide|2e)/],
  ["narrow", /narrow/], ["regular", /(?:regular|standard|medium)/]
];

const rowsFor = (chart) => [...chart.kids, ...chart.adult];
/** Interpolation rows for one system, sorted by that system's size. */
const pointsFor = (system, chart = SHOE_CHART) => {
  const rows = system === "cm" ? rowsFor(chart).map((r) => ({ x: r.cm, y: r.cm })) : rowsFor(chart).filter((r) => r[FIELD[system]] !== null).map((r) => ({ x: r[FIELD[system]], y: r.cm }));
  return rows.sort((a, b) => a.x - b.x);
};
const toCm = (system, n, chart) => interpolate(pointsFor(system, chart), n);
const fromCm = (system, cm, chart) => {
  if (system === "cm") return roundTo(cm, 1);
  const pts = pointsFor(system, chart).map((p) => ({ x: p.y, y: p.x }));
  const v = interpolate(pts, cm);
  return v === null ? null : toHalf(v);
};

const takeWidth = (text) => {
  for (const [id, re] of WIDTH_WORDS) {
    const m = text.match(new RegExp(`^(.*?)[\\s,·|-]*\\b${re.source}$`));
    if (m) return { rest: m[1].trim(), width: id };
  }
  return { rest: text, width: null };
};
const GENDER = { m: "m", men: "m", mens: "m", "men's": "m", w: "w", women: "w", womens: "w", "women's": "w", ladies: "w" };

export default defineScale({
  id: "shoe",
  label: "Shoe size",
  accepts: "EU 42, UK 8.5, US 9 men, US 10.5 women, 26.7 cm; half sizes; optional width (narrow, regular, wide, extra wide)",
  display: "EU 42, UK 8.5, US 9 (men), US 10.5 (women), 26.7 cm, with ' · Wide' when a width is set",
  systems: [{ id: "eu", label: "EU" }, { id: "uk", label: "UK" }, { id: "us-m", label: "US men" }, { id: "us-w", label: "US women" }, { id: "cm", label: "Foot length (cm)" }],
  units: ["cm"],
  examples: {
    valid: ["EU 42", "42 EU", "UK 8.5", "UK 8", "US 9 men", "US 10.5 women", "26.7 cm", "EU 42 wide", "eu 38 narrow", "US 9 M"],
    invalid: ["", "42", "EU 42.3", "EU 60", "UK 20", "US 9", "EU 42 4F", "shoe", "UK 2 EU 40"]
  },
  parse(raw, ctx = {}) {
    const { rest, width } = takeWidth(norm(raw));
    const m = rest.match(/^(?:(eu|uk|us|cm)\s*)?(\d+(?:\.\d+)?(?:\s\d\/\d)?)\s*(eu|uk|us|cm)?\s*(?:\(?(m|men|mens|men's|w|women|womens|women's|ladies)\)?)?$/);
    if (!m) return fail("not-a-shoe-size", `"${String(raw).trim()}" is not a shoe size (try EU 42, UK 8 or 26.5 cm)`);
    if (m[1] && m[3] && m[1] !== m[3]) return fail("mixed-systems", "Use one sizing system per value");
    let sys = m[1] || m[3] || ctx.system || null;
    const gender = GENDER[m[4]] ?? (ctx.gender ? GENDER[String(ctx.gender).toLowerCase()] : null);
    if (!sys) return fail("system-required", `Say which system ${m[2]} is in (EU, UK, US or cm)`, { needs: "system", options: ["eu", "uk", "us-m", "us-w", "cm"] });
    if (sys === "us") {
      if (!gender) return fail("gender-required", "US shoe sizes differ for men and women: add men or women", { needs: "gender", options: ["us-m", "us-w"] });
      sys = gender === "m" ? "us-m" : "us-w";
    } else if (m[4] && sys !== "us-m" && sys !== "us-w") return fail("bad-gender", "Men or women only applies to US sizes");
    if (!SHOE_CHART.systems.includes(sys)) return fail("unknown-system", `"${sys}" is not a shoe system`);
    const n = m[2].includes("/") ? Number(m[2].split(" ")[0]) + Number(m[2].split(" ")[1][0]) / Number(m[2].split(" ")[1][2]) : Number(m[2]);
    if (sys === "cm") {
      if (!isMultiple(n, 0.1)) return fail("too-precise", "Foot length goes to one decimal (26.7 cm)");
    } else if (!isMultiple(n, 0.5)) return fail("not-half", "Shoe sizes go up in whole and half sizes");
    if (toCm(sys, n) === null) return fail("out-of-range", `${sys === "cm" ? `${num2str(n)} cm` : `${sys.toUpperCase()} ${num2str(n)}`} is outside the shoe chart`);
    const value = { system: sys, value: n };
    if (sys === "cm") value.unit = "cm";
    if (width) value.width = width;
    return ok(value);
  },
  format(value, opts = {}) {
    let { system, value: n } = value;
    if (opts.system && opts.system !== system && !opts.canonical) {
      const conv = fromCm(opts.system, toCm(system, n), SHOE_CHART);
      if (conv !== null) { system = opts.system; n = conv; }
    }
    const label = system === "eu" ? `EU ${num2str(n)}` : system === "uk" ? `UK ${num2str(n)}` : system === "us-m" ? `US ${num2str(n)} (men)` : system === "us-w" ? `US ${num2str(n)} (women)` : `${num2str(n)} cm`;
    return value.width ? `${label} · ${WIDTH_LABEL[value.width]}` : label;
  },
  toBase: (value) => roundTo(toCm(value.system, value.value), 2),
  compare(a, b) {
    const d = roundTo(toCm(a.system, a.value), 2) - roundTo(toCm(b.system, b.value), 2);
    return d !== 0 ? d : SHOE_CHART.widths.indexOf(a.width ?? "regular") - SHOE_CHART.widths.indexOf(b.width ?? "regular");
  }
});

export { fromCm as shoeFromCm, toCm as shoeToCm };
