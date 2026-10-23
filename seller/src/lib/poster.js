import { shopDisplayUrl, shopQrUrl } from "@epicmkt/shared";

// Print-ready QR posters drawn straight onto a canvas. Everything is laid out on a 1000-unit-wide sheet
// (A4 and A5 share the same 1 : 1.414 shape) and scaled to the pixel size asked for, so the live preview,
// the PNG and the PDF are the same picture.

export const TAGLINE = "Scan to see our prices and location";
export const SHEET = { w: 1000, h: Math.round(1000 * Math.SQRT2) };
export const SIZES = {
  a4: { label: "A4", mm: [210, 297], px: [2480, 3508] }, // 300 dpi
  a5: { label: "A5", mm: [148, 210], px: [1748, 2480] }, // 300 dpi
};

const NAVY = "#0b2545";
const SKY = "#38b6ff";
const SKY_DEEP = "#0f8fd9";
const INK = "#111111";
const FONT = `"Inter Variable", "Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
const font = (weight, px) => `${weight} ${Math.round(px)}px ${FONT}`;

// ---- lazy libraries --------------------------------------------------------------------------------------------

let qrLib;
const loadQr = () => (qrLib ??= import("qrcode").then((m) => m.default ?? m));

// The matrix for the public link. Premium posters carry a logo in the middle, so they use the highest error correction.
export async function buildMatrix(slug, { withLogo = false } = {}) {
  const QR = await loadQr();
  const text = shopQrUrl(slug, import.meta.env?.VITE_SITE_URL);
  const { modules } = QR.create(text, { errorCorrectionLevel: withLogo ? "H" : "M" });
  return { text, size: modules.size, dark: (r, c) => modules.get(r, c) === 1 || modules.get(r, c) === true };
}

export function loadImage(url, timeoutMs = 8000) {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // a tainted canvas cannot be exported
    const done = (v) => {
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    img.onload = () => done(img.naturalWidth > 0 ? img : null);
    img.onerror = () => done(null);
    img.src = url;
  });
}

// ---- drawing helpers -------------------------------------------------------------------------------------------

const rr = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else {
    const k = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + k, y);
    ctx.arcTo(x + w, y, x + w, y + h, k);
    ctx.arcTo(x + w, y + h, x, y + h, k);
    ctx.arcTo(x, y + h, x, y, k);
    ctx.arcTo(x, y, x + w, y, k);
    ctx.closePath();
  }
};

export function wrapLines(measure, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (measure(next) <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Biggest type that fits the box in at most `maxLines` lines. Shrinks first, ellipsises only as a last resort.
export function fitText(ctx, text, { maxWidth, startPx, minPx, maxLines, weight = 800 }) {
  for (let px = startPx; px >= minPx; px -= 2) {
    ctx.font = font(weight, px);
    const lines = wrapLines((t) => ctx.measureText(t).width, text, maxWidth);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxWidth)) return { px, lines };
  }
  ctx.font = font(weight, minPx);
  const all = wrapLines((t) => ctx.measureText(t).width, text, maxWidth);
  const lines = all.slice(0, maxLines);
  const clip = (t) => {
    let out = t;
    while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
    return `${out.trimEnd()}…`;
  };
  const cut = all.length > maxLines;
  return { px: minPx, lines: lines.map((l, i) => (cut && i === lines.length - 1) || ctx.measureText(l).width > maxWidth ? clip(l) : l) };
}

const initialsOf = (name) => (name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "E";

function drawLines(ctx, lines, cx, y, px, lineHeight) {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  lines.forEach((l, i) => ctx.fillText(l, cx, y + i * px * lineHeight));
  return y + (lines.length - 1) * px * lineHeight;
}

// Finder squares are drawn whole, so the code keeps its three big eyes whichever style is chosen.
const inFinder = (r, c, n) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

function drawMatrix(ctx, matrix, x, y, side, { color, rounded, paper }) {
  const quiet = 4;
  const total = matrix.size + quiet * 2;
  const m = side / total;
  const ox = x + quiet * m;
  const oy = y + quiet * m;
  ctx.fillStyle = paper;
  ctx.fillRect(x, y, side, side);
  ctx.fillStyle = color;
  const inset = rounded ? m * 0.02 : 0;
  for (let r = 0; r < matrix.size; r += 1) {
    for (let c = 0; c < matrix.size; c += 1) {
      if (!matrix.dark(r, c) || inFinder(r, c, matrix.size)) continue;
      const px = ox + c * m + inset;
      const py = oy + r * m + inset;
      if (rounded) {
        rr(ctx, px, py, m - inset * 2, m - inset * 2, m * 0.27);
        ctx.fill();
      } else ctx.fillRect(Math.floor(px), Math.floor(py), Math.ceil(m), Math.ceil(m));
    }
  }
  for (const [fr, fc] of [[0, 0], [0, matrix.size - 7], [matrix.size - 7, 0]]) {
    const fx = ox + fc * m;
    const fy = oy + fr * m;
    if (rounded) {
      ctx.fillStyle = color;
      rr(ctx, fx, fy, 7 * m, 7 * m, 2.1 * m);
      ctx.fill();
      ctx.fillStyle = paper;
      rr(ctx, fx + m, fy + m, 5 * m, 5 * m, 1.4 * m);
      ctx.fill();
      ctx.fillStyle = color;
      rr(ctx, fx + 2 * m, fy + 2 * m, 3 * m, 3 * m, 0.95 * m);
      ctx.fill();
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(Math.floor(fx), Math.floor(fy), Math.ceil(7 * m), Math.ceil(7 * m));
      ctx.fillStyle = paper;
      ctx.fillRect(Math.floor(fx + m), Math.floor(fy + m), Math.ceil(5 * m), Math.ceil(5 * m));
      ctx.fillStyle = color;
      ctx.fillRect(Math.floor(fx + 2 * m), Math.floor(fy + 2 * m), Math.ceil(3 * m), Math.ceil(3 * m));
    }
  }
  return { cx: x + side / 2, cy: y + side / 2, side, m };
}

function drawLogoDisc(ctx, img, name, cx, cy, r, { ring, fill }) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r + ring, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (img) {
    const s = Math.max((r * 2) / img.naturalWidth, (r * 2) / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  } else {
    ctx.fillStyle = fill;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = NAVY;
    ctx.font = font(800, r * 0.9);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initialsOf(name), cx, cy + r * 0.04);
  }
  ctx.restore();
}

// ---- the two designs -------------------------------------------------------------------------------------------

function drawPlain(ctx, { name, slug, matrix }) {
  const { w, h } = SHEET;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  rr(ctx, 48, 48, w - 96, h - 96, 18);
  ctx.stroke();

  ctx.fillStyle = INK;
  const t = fitText(ctx, name, { maxWidth: 780, startPx: 96, minPx: 48, maxLines: 2 });
  ctx.font = font(800, t.px);
  const nameEnd = drawLines(ctx, t.lines, w / 2, 250, t.px, 1.12);

  ctx.fillStyle = INK;
  ctx.fillRect(w / 2 - 70, nameEnd + 54, 140, 6);

  ctx.font = font(600, 44);
  ctx.fillStyle = "#374151";
  ctx.textAlign = "center";
  ctx.fillText(TAGLINE, w / 2, nameEnd + 140);

  const side = 640;
  const qy = nameEnd + 190;
  drawMatrix(ctx, matrix, (w - side) / 2, qy, side, { color: "#000000", rounded: false, paper: "#ffffff" });

  ctx.font = font(700, 42);
  ctx.fillStyle = INK;
  ctx.fillText(shopDisplayUrl(slug, import.meta.env?.VITE_SITE_URL), w / 2, qy + side + 72);

  ctx.font = font(600, 28);
  ctx.fillStyle = "#6b7280";
  ctx.fillText("EpicMKT", w / 2, h - 100);
}

function drawBranded(ctx, { name, slug, matrix, logo }) {
  const { w, h } = SHEET;
  const cx = w / 2;

  ctx.fillStyle = "#f2f9ff";
  ctx.fillRect(0, 0, w, h);

  // Hero with a soft curved edge.
  const g = ctx.createLinearGradient(0, 0, w, 460);
  g.addColorStop(0, NAVY);
  g.addColorStop(1, "#14508f");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(w, 300);
  ctx.quadraticCurveTo(cx, 425, 0, 300);
  ctx.closePath();
  ctx.fill();

  // Quiet decoration, kept inside the hero.
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "rgba(56,182,255,0.16)";
  ctx.beginPath();
  ctx.arc(130, 70, 230, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(56,182,255,0.10)";
  ctx.beginPath();
  ctx.arc(900, 330, 280, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.arc(880, 60, 70 + i * 46, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // EpicMKT mark at the top of the hero.
  ctx.fillStyle = SKY;
  rr(ctx, 64, 60, 62, 62, 16);
  ctx.fill();
  ctx.fillStyle = NAVY;
  ctx.font = font(900, 40);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("E", 95, 93);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = font(800, 38);
  ctx.textAlign = "left";
  ctx.fillText("EpicMKT", 142, 106);

  // Logo disc straddling the hero edge.
  ctx.save();
  ctx.shadowColor = "rgba(11,37,69,0.35)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  drawLogoDisc(ctx, logo, name, cx, 282, 106, { ring: 14, fill: SKY });
  ctx.restore();

  // Name
  ctx.fillStyle = NAVY;
  const t = fitText(ctx, name, { maxWidth: 820, startPx: 84, minPx: 44, maxLines: 2 });
  ctx.font = font(850, t.px);
  const nameEnd = drawLines(ctx, t.lines, cx, 502, t.px, 1.1);

  // Tagline
  const tagY = nameEnd + 72;
  ctx.font = font(700, 40);
  ctx.fillStyle = SKY_DEEP;
  ctx.textAlign = "center";
  ctx.fillText(TAGLINE, cx, tagY);

  // QR card
  const card = t.lines.length === 1 ? 560 : 500;
  const cardX = (w - card) / 2;
  const cardY = tagY + 40;
  ctx.save();
  ctx.shadowColor = "rgba(11,37,69,0.22)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = "#ffffff";
  rr(ctx, cardX, cardY, card, card, 40);
  ctx.fill();
  ctx.restore();

  // Corner brackets
  ctx.strokeStyle = SKY;
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  const b = 56;
  const o = 18;
  for (const [sx, sy, dx, dy] of [[cardX - o, cardY - o, 1, 1], [cardX + card + o, cardY - o, -1, 1], [cardX - o, cardY + card + o, 1, -1], [cardX + card + o, cardY + card + o, -1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(sx + dx * b, sy);
    ctx.lineTo(sx, sy);
    ctx.lineTo(sx, sy + dy * b);
    ctx.stroke();
  }

  const pad = 22;
  const q = drawMatrix(ctx, matrix, cardX + pad, cardY + pad, card - pad * 2, { color: NAVY, rounded: true, paper: "#ffffff" });
  if (logo) drawLogoDisc(ctx, logo, name, q.cx, q.cy, q.side * 0.085, { ring: q.m * 1.4, fill: SKY });

  // Link pill
  const url = shopDisplayUrl(slug, import.meta.env?.VITE_SITE_URL);
  ctx.font = font(750, 38);
  const pw = Math.min(820, ctx.measureText(url).width + 96);
  const py = cardY + card + 46;
  ctx.fillStyle = NAVY;
  rr(ctx, cx - pw / 2, py, pw, 66, 33);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(url, cx, py + 35);
  ctx.textBaseline = "alphabetic";

  // Footer
  ctx.fillStyle = SKY;
  ctx.fillRect(0, h - 70, w, 70);
  ctx.fillStyle = NAVY;
  ctx.font = font(800, 28);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Listed on EpicMKT  ·  epicmkt.app", cx, h - 35);
  ctx.textBaseline = "alphabetic";
}

// ---- public API ------------------------------------------------------------------------------------------------

export const posterStyle = (planKey) => (planKey === "premium" ? "branded" : "plain");

// Draws the whole poster onto `canvas` at the pixel width asked for.
export async function renderPoster(canvas, { name, slug, planKey, logoUrl = null, widthPx }) {
  const style = posterStyle(planKey);
  const [matrix, logo] = await Promise.all([buildMatrix(slug, { withLogo: style === "branded" && !!logoUrl }), style === "branded" ? loadImage(logoUrl) : null]);
  // If the logo failed to load, the code was built for it anyway (higher correction), which is still a valid code.
  const scale = widthPx / SHEET.w;
  canvas.width = Math.round(SHEET.w * scale);
  canvas.height = Math.round(SHEET.h * scale);
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.scale(canvas.width / SHEET.w, canvas.height / SHEET.h);
  (style === "branded" ? drawBranded : drawPlain)(ctx, { name: name || "Your shop", slug, matrix, logo });
  ctx.restore();
  return { canvas, style, text: matrix.text };
}

export const posterFileName = (slug, size, ext) => `epicmkt-qr-${slug}-${size}.${ext}`;

export const canvasToBlob = (canvas, type = "image/png") =>
  new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("export_failed"))), type));

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function printCanvas(opts, size) {
  const canvas = document.createElement("canvas");
  await renderPoster(canvas, { ...opts, widthPx: SIZES[size].px[0] });
  return canvas;
}

export async function downloadPng(opts, size) {
  const canvas = await printCanvas(opts, size);
  saveBlob(await canvasToBlob(canvas), posterFileName(opts.slug, size, "png"));
}

export async function downloadPdf(opts, size) {
  const [{ jsPDF }, canvas] = await Promise.all([import("jspdf"), printCanvas(opts, size)]);
  const [w, h] = SIZES[size].mm;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: size, compress: true });
  doc.setProperties({ title: `${opts.name} QR poster`, subject: "EpicMKT QR poster", creator: "EpicMKT" });
  doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, w, h, undefined, "FAST");
  saveBlob(doc.output("blob"), posterFileName(opts.slug, size, "pdf"));
}
