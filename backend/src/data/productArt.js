// Demo product pictures, drawn as SVG so the demo needs no image files: a product on a light studio background, the same
// product from other angles, a close-up, a size picture with measurements and an outdoor scene. Only the demo backend uses
// these; live items show the seller's own photos.

const uri = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Darker and lighter shades of a hex colour, for shading.
const shade = (hex, amount) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (amount < 0 ? c * amount : (255 - c) * amount))));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
};

const W = 800;
const H = 800;
const studio = (inner, bg = "#f4f4f5") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs><radialGradient id="floor" cx="50%" cy="78%" r="45%"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs><rect width="${W}" height="${H}" fill="${bg}"/><ellipse cx="400" cy="640" rx="290" ry="40" fill="url(#floor)"/>${inner}</svg>`;

const mesh = (id, color) =>
  `<pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${color}"/><circle cx="5" cy="5" r="1.6" fill="${shade(color, -0.45)}"/></pattern>`;

const logo = (x, y, text, size, color, rotate = 0) =>
  text ? `<text x="${x}" y="${y}" font-family="Inter,Arial,sans-serif" font-weight="900" font-size="${size}" fill="${color}" text-anchor="middle" transform="rotate(${rotate} ${x} ${y})" letter-spacing="2">${esc(text)}</text>` : "";

/** Shapes. Each returns SVG for an 800 x 800 picture. */
const SHAPES = {
  // A cylinder speaker lying on its side, with round end caps.
  cylinder: ({ color, brand }) => {
    const d = shade(color, -0.35), l = shade(color, 0.25);
    return `<defs>${mesh("m", color)}<linearGradient id="sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient></defs>
      <rect x="150" y="330" width="500" height="250" rx="125" fill="url(#m)"/><rect x="150" y="330" width="500" height="250" rx="125" fill="url(#sh)"/>
      <ellipse cx="170" cy="455" rx="62" ry="128" fill="${d}"/><ellipse cx="170" cy="455" rx="40" ry="90" fill="${shade(color, -0.55)}"/><path d="M160 430 l28 25 -28 25z" fill="${l}"/>
      <ellipse cx="630" cy="455" rx="62" ry="128" fill="${d}"/>${logo(400, 480, brand, 70, l)}
      <rect x="330" y="335" width="140" height="18" rx="9" fill="${d}"/><circle cx="360" cy="344" r="5" fill="${l}"/><circle cx="400" cy="344" r="5" fill="${l}"/><circle cx="440" cy="344" r="5" fill="${l}"/>`;
  },
  // A bigger pill shape with a handle-free body (power-bank speaker).
  capsule: ({ color, brand }) => {
    const d = shade(color, -0.4), l = shade(color, 0.3);
    return `<defs>${mesh("m", color)}<linearGradient id="sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".4"/></linearGradient></defs>
      <rect x="110" y="300" width="580" height="300" rx="150" fill="url(#m)"/><rect x="110" y="300" width="580" height="300" rx="150" fill="url(#sh)"/>
      <circle cx="150" cy="450" r="118" fill="${d}"/><circle cx="150" cy="450" r="78" fill="${shade(color, -0.6)}"/><circle cx="150" cy="450" r="30" fill="${l}"/>
      <circle cx="650" cy="450" r="118" fill="${d}"/>${logo(410, 480, brand, 92, "#e2572b")}
      <rect x="250" y="590" width="320" height="22" rx="11" fill="${d}"/>`;
  },
  // A tall party tower with a light ring.
  tower: ({ color, brand }) => {
    const d = shade(color, -0.45);
    return `<defs>${mesh("m", color)}<linearGradient id="rgb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset=".5" stop-color="#a855f7"/><stop offset="1" stop-color="#3b82f6"/></linearGradient></defs>
      <rect x="250" y="110" width="300" height="540" rx="70" fill="url(#m)"/><rect x="250" y="110" width="300" height="540" rx="70" fill="#000" opacity=".15"/>
      <rect x="290" y="170" width="220" height="200" rx="100" fill="none" stroke="url(#rgb)" stroke-width="18"/><rect x="290" y="400" width="220" height="200" rx="100" fill="none" stroke="url(#rgb)" stroke-width="18"/>
      <rect x="270" y="120" width="260" height="34" rx="12" fill="${d}"/>${logo(400, 395, brand, 46, "#fff", -90)}`;
  },
  // A boxy home speaker with grille cloth, knobs and a script logo.
  box: ({ color, brand }) => {
    const d = shade(color, -0.5), gold = "#c9a96e";
    return `<defs><pattern id="g" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${shade(color, -0.25)}"/><path d="M0 0 L8 8 M8 0 L0 8" stroke="${shade(color, -0.6)}" stroke-width="1"/></pattern></defs>
      <rect x="140" y="220" width="520" height="400" rx="26" fill="${d}"/><rect x="170" y="290" width="460" height="300" rx="10" fill="url(#g)"/>
      <rect x="170" y="235" width="460" height="40" rx="6" fill="${gold}"/>${[230, 300, 370, 440].map((x) => `<circle cx="${x}" cy="255" r="11" fill="${shade(gold, -0.4)}"/>`).join("")}
      <text x="400" y="460" font-family="Georgia,serif" font-style="italic" font-size="64" fill="${gold}" text-anchor="middle">${esc(brand)}</text>`;
  },
  // A long, low soundbar with a small subwoofer.
  soundbar: ({ color, brand }) => {
    const d = shade(color, -0.3);
    return `<defs>${mesh("m", color)}</defs><rect x="70" y="420" width="560" height="90" rx="40" fill="url(#m)"/><rect x="70" y="420" width="560" height="22" rx="11" fill="${d}"/>
      ${logo(350, 478, brand, 30, shade(color, 0.5))}<rect x="560" y="300" width="170" height="320" rx="24" fill="${d}"/><circle cx="645" cy="470" r="62" fill="url(#m)"/><circle cx="645" cy="470" r="22" fill="${shade(color, -0.6)}"/>`;
  },
  // A small round speaker with a strap.
  puck: ({ color, brand }) => {
    const d = shade(color, -0.4);
    return `<defs>${mesh("m", color)}</defs><path d="M300 210 q100 -120 200 0" stroke="${d}" stroke-width="24" fill="none" stroke-linecap="round"/>
      <circle cx="400" cy="420" r="210" fill="url(#m)"/><circle cx="400" cy="420" r="210" fill="none" stroke="${d}" stroke-width="26"/>${logo(400, 440, brand, 58, shade(color, 0.6))}`;
  },
  // A flat TV on a stand, showing a landscape.
  tv: ({ brand }) =>
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0ea5e9"/><stop offset=".6" stop-color="#f59e0b"/><stop offset="1" stop-color="#7c2d12"/></linearGradient></defs>
      <rect x="70" y="170" width="660" height="390" rx="10" fill="#111"/><rect x="84" y="184" width="632" height="362" fill="url(#sky)"/><path d="M84 470 L240 380 L360 450 L520 340 L716 470 L716 546 L84 546 Z" fill="#1e3a2a"/>
      <rect x="360" y="560" width="80" height="40" fill="#222"/><rect x="270" y="598" width="260" height="14" rx="7" fill="#333"/>${logo(400, 586, brand, 16, "#9ca3af")}`
};

/** One picture of a product. kind: front | angle | side | detail | size | outdoor. */
export function productPicture({ shape, color = "#1f2937", brand = "", kind = "front", size = null, name = "" }) {
  const draw = SHAPES[shape] ?? SHAPES.cylinder;
  const body = draw({ color, brand });
  if (kind === "angle") return uri(studio(`<g transform="translate(400 420) rotate(-14) scale(.92) translate(-400 -420)">${body}</g>`));
  if (kind === "side") return uri(studio(`<g transform="translate(400 430) scale(.78 .92) translate(-400 -430)">${body}</g>`, "#ececee"));
  if (kind === "detail") return uri(studio(`<g transform="translate(400 400) scale(1.9) translate(-400 -400)">${body}</g>`, "#e5e7eb"));
  if (kind === "outdoor")
    return uri(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7dd3fc"/><stop offset=".55" stop-color="#bae6fd"/><stop offset=".56" stop-color="#65a30d"/><stop offset="1" stop-color="#365314"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#s)"/><circle cx="640" cy="140" r="60" fill="#fde68a"/><g transform="translate(400 560) scale(.55) translate(-400 -450)">${body}</g><text x="40" y="760" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="700" fill="#fff">${esc(name)}</text></svg>`
    );
  if (kind === "size" && size) {
    const { l, h, d, weight } = size;
    return uri(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="o" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbbf24"/><stop offset="1" stop-color="#ea580c"/></linearGradient><marker id="a" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#fff"/></marker></defs><rect width="${W}" height="${H}" fill="url(#o)"/>
        <text x="60" y="90" font-family="Inter,Arial,sans-serif" font-weight="800" font-size="40" fill="#fff">NET WEIGHT: ${esc(weight)}</text>
        <g transform="translate(400 430) scale(.8) translate(-400 -450)">${body}</g>
        <line x1="150" y1="640" x2="650" y2="640" stroke="#fff" stroke-width="4" stroke-dasharray="8 8" marker-start="url(#a)" marker-end="url(#a)"/><text x="400" y="690" font-family="Inter,Arial,sans-serif" font-size="34" fill="#fff" text-anchor="middle">${esc(l)}</text>
        <line x1="90" y1="300" x2="90" y2="560" stroke="#fff" stroke-width="4" stroke-dasharray="8 8" marker-start="url(#a)" marker-end="url(#a)"/><text x="80" y="440" font-family="Inter,Arial,sans-serif" font-size="30" fill="#fff" text-anchor="end" transform="rotate(-90 70 440)">${esc(h)}</text>
        <text x="700" y="250" font-family="Inter,Arial,sans-serif" font-size="30" fill="#fff" text-anchor="end">${esc(d)}</text></svg>`
    );
  }
  return uri(studio(body));
}

/** The usual set of pictures for one product and colour: front, angle, side, close-up, size and outdoor. */
export function productPictures({ shape, color, brand, size, name, captionOf = (k) => k }) {
  const kinds = ["front", "angle", "side", "detail", ...(size ? ["size"] : []), "outdoor"];
  return kinds.map((kind, i) => ({ id: `p${i + 1}`, url: productPicture({ shape, color, brand, kind, size, name }), caption: captionOf(kind) }));
}
