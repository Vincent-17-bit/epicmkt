// A colour for a colour name, so a colour choice with no photo still shows its colour ("Black" draws a black dot, not a blank card).
// English and the Swahili names sellers in Kenya use. Two colours ("Black/Red", "Black and white") draw a split swatch.
// A seller's own hex (value.color) always wins over this guess.

const HEX = {
  black: "#111111", "jet black": "#0a0a0a", "matte black": "#1c1c1c", charcoal: "#36454f", graphite: "#41424c",
  white: "#ffffff", "off white": "#f5f3ea", ivory: "#fffff0", cream: "#f6eccf", pearl: "#f0ead6", snow: "#fffafa",
  grey: "#8a8d91", gray: "#8a8d91", "space grey": "#5f6368", "space gray": "#5f6368", "light grey": "#c8cacd", "light gray": "#c8cacd",
  "dark grey": "#4a4d52", "dark gray": "#4a4d52", silver: "#c0c0c0", ash: "#b2beb5", slate: "#6d7b8d", gunmetal: "#2a3439",
  red: "#d32f2f", maroon: "#800000", burgundy: "#800020", wine: "#722f37", crimson: "#dc143c", scarlet: "#ff2400", cherry: "#a4133c",
  "dark red": "#8b0000", ruby: "#9b111e", coral: "#ff7f50", salmon: "#fa8072", rust: "#b7410e",
  orange: "#f57c00", peach: "#ffcba4", apricot: "#fbceb1", tangerine: "#f28500", amber: "#ffbf00",
  yellow: "#fbc02d", gold: "#d4af37", "rose gold": "#b76e79", mustard: "#e1ad01", lemon: "#fff44f", champagne: "#f7e7ce",
  green: "#2e7d32", "dark green": "#1b5e20", "light green": "#8bc34a", "olive": "#708238", "olive green": "#708238", "army green": "#4b5320",
  khaki: "#c3b091", mint: "#98ff98", lime: "#9acd32", emerald: "#50c878", teal: "#008080", sage: "#9caf88", forest: "#228b22", jade: "#00a86b",
  blue: "#1e63d0", "navy": "#1f2a44", "navy blue": "#1f2a44", "royal blue": "#4169e1", "sky blue": "#87ceeb", "light blue": "#9ecbf0",
  "dark blue": "#0d2f6e", "baby blue": "#a1caf1", turquoise: "#40e0d0", cyan: "#00bcd4", aqua: "#00ffff", denim: "#1560bd", cobalt: "#0047ab",
  indigo: "#3f51b5", "midnight blue": "#191970", "midnight": "#191970", "ocean blue": "#4f97a3", "pacific blue": "#1ca9c9",
  purple: "#7b1fa2", violet: "#8f00ff", lilac: "#c8a2c8", lavender: "#b57edc", mauve: "#e0b0ff", plum: "#8e4585", magenta: "#d81b60",
  pink: "#ec407a", "hot pink": "#ff69b4", "baby pink": "#f4c2c2", "light pink": "#ffb6c1", rose: "#e8a0a8", blush: "#de5d83", fuchsia: "#ff00ff",
  brown: "#795548", "dark brown": "#4e342e", "light brown": "#a1887f", tan: "#d2b48c", beige: "#e8dcc4", camel: "#c19a6b", chocolate: "#7b3f00",
  coffee: "#6f4e37", mocha: "#967969", caramel: "#af6f09", nude: "#e3bc9a", sand: "#c2b280", taupe: "#8b8589", bronze: "#cd7f32", copper: "#b87333",
  wood: "#a0703c", walnut: "#5d432c", oak: "#c19a6b", mahogany: "#c04000", natural: "#e5d3b3",
  transparent: "repeating-conic-gradient(#d9d9d9 0% 25%, #ffffff 0% 50%) 50% / 10px 10px", clear: "repeating-conic-gradient(#d9d9d9 0% 25%, #ffffff 0% 50%) 50% / 10px 10px",
  multicolour: "conic-gradient(#e53935, #fbc02d, #43a047, #1e88e5, #8e24aa, #e53935)", multicolor: "conic-gradient(#e53935, #fbc02d, #43a047, #1e88e5, #8e24aa, #e53935)",
  rainbow: "conic-gradient(#e53935, #fbc02d, #43a047, #1e88e5, #8e24aa, #e53935)", "assorted": "conic-gradient(#e53935, #fbc02d, #43a047, #1e88e5, #8e24aa, #e53935)",
  // Swahili
  nyeusi: "#111111", nyeupe: "#ffffff", nyekundu: "#d32f2f", kijani: "#2e7d32", bluu: "#1e63d0", buluu: "#1e63d0", samawati: "#87ceeb",
  njano: "#fbc02d", manjano: "#fbc02d", kahawia: "#795548", kijivu: "#8a8d91", zambarau: "#7b1fa2", waridi: "#ec407a", pinki: "#ec407a",
  "rangi ya machungwa": "#f57c00", machungwa: "#f57c00", dhahabu: "#d4af37", fedha: "#c0c0c0", hudhurungi: "#a0522d",
};

const KEYS = Object.keys(HEX).sort((a, b) => b.length - a.length);
const norm = (s) => String(s ?? "").toLowerCase().replace(/\bcolou?rs?\b/g, " ").replace(/[^a-z\s/&+,-]/g, " ").replace(/\s+/g, " ").trim();

// The colour words in a name, longest match first: "Space Grey" is one colour, "Black/Red" two.
const coloursIn = (name) => {
  const parts = norm(name).split(/\s*(?:\/|&|\+|,|\band\b|\bwith\b|\bna\b|-)\s*/).filter(Boolean);
  const out = [];
  for (const part of parts) {
    const hit = KEYS.find((k) => part === k) ?? KEYS.find((k) => new RegExp(`(^|\\s)${k}(\\s|$)`).test(part));
    if (hit && !out.includes(HEX[hit])) out.push(HEX[hit]);
  }
  return out;
};

/** A CSS background for a colour name ("#111111", or a split gradient for two), or "" when the name is not a known colour. */
export function colourOf(name) {
  const found = coloursIn(name);
  if (found.length === 0) return "";
  if (found.length === 1 || found[0].includes("gradient")) return found[0];
  const [a, b] = found.filter((c) => !c.includes("gradient"));
  return b ? `linear-gradient(135deg, ${a} 50%, ${b} 50%)` : a;
}

/** A plain #rrggbb for a colour name when there is exactly one (what the seller form can store as value.color), else "". */
export function colourHexOf(name) {
  const found = coloursIn(name);
  return found.length === 1 && /^#[0-9a-f]{6}$/.test(found[0]) ? found[0] : "";
}

/** Whether an option type is about colour ("Colour", "Color", "Frame colour", "Rangi"). */
export const isColourNamedAxis = (axis) => /colou?r|rangi/i.test(`${axis?.key ?? ""} ${axis?.label ?? ""}`) || axis?.display === "swatch";
