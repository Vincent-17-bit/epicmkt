import { POSTER_SIZES, POSTER_TAGLINE } from "@epicmkt/shared";

const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const BLUE = "#38b6ff";
const INK = "#111111";

const font = (weight, px) => `${weight} ${px}px ${FONT}`;

export const loadQr = async (text) => {
  const QR = (await import("qrcode")).default ?? (await import("qrcode"));
  const q = QR.create(text, { errorCorrectionLevel: "Q" });
  return { size: q.modules.size, get: (r, c) => q.modules.get(r, c) === 1 || q.modules.get(r, c) === true };
};

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const drawBrandMark = (ctx, x, y, size) => {
  const k = size / 512;
  ctx.fillStyle = BLUE;
  roundRect(ctx, x, y, size, size, 112 * k);
  ctx.fill();
  ctx.fillStyle = INK;
  for (const [rx, ry, rw, rh] of [[150, 140, 60, 232], [150, 140, 212, 56], [150, 226, 212, 60], [150, 316, 212, 56]]) {
    ctx.fillRect(x + rx * k, y + ry * k, rw * k, rh * k);
  }
};

const wrapLines = (ctx, text, maxWidth, maxLines) => {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !line) line = test;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}…`;
    return kept;
  }
  return lines;
};

const fitLines = (ctx, text, weight, startPx, minPx, maxWidth, maxLines) => {
  let px = startPx;
  for (; px > minPx; px -= startPx * 0.04) {
    ctx.font = font(weight, px);
    if (wrapLines(ctx, text, maxWidth, maxLines + 1).length <= maxLines && wrapLines(ctx, text, maxWidth, maxLines).every((l) => ctx.measureText(l).width <= maxWidth)) break;
  }
  ctx.font = font(weight, px);
  return { px, lines: wrapLines(ctx, text, maxWidth, maxLines) };
};

const drawQr = (ctx, matrix, x, y, side, quiet = 4) => {
  const cells = matrix.size + quiet * 2;
  const cell = Math.floor((side / cells) * 100) / 100;
  const used = cell * cells;
  const ox = x + (side - used) / 2;
  const oy = y + (side - used) / 2;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(ox, oy, used, used);
  ctx.fillStyle = INK;
  for (let r = 0; r < matrix.size; r++) {
    for (let c = 0; c < matrix.size; c++) {
      if (matrix.get(r, c)) ctx.fillRect(ox + (c + quiet) * cell, oy + (r + quiet) * cell, Math.ceil(cell * 100) / 100 + 0.4, Math.ceil(cell * 100) / 100 + 0.4);
    }
  }
};

const initials = (name) =>
  String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "E";

const drawLogo = (ctx, logo, name, cx, cy, r) => {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (logo) {
    const w = logo.width;
    const h = logo.height;
    const s = Math.max((r * 2) / w, (r * 2) / h);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.drawImage(logo, cx - (w * s) / 2, cy - (h * s) / 2, w * s, h * s);
  } else {
    ctx.fillStyle = BLUE;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = font(800, r * 0.95);
    ctx.fillText(initials(name), cx, cy + r * 0.04);
  }
  ctx.restore();
};

const drawPlain = (ctx, W, H, { name, matrix, display }) => {
  const u = W / 100;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";
  const markSize = 8 * u;
  ctx.font = font(800, 5.4 * u);
  const word = "EpicMKT";
  const wordW = ctx.measureText(word).width;
  const rowW = markSize + 2 * u + wordW;
  const rowX = (W - rowW) / 2;
  drawBrandMark(ctx, rowX, 8 * u, markSize);
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.fillText(word, rowX + markSize + 2 * u, 8 * u + markSize * 0.72);

  ctx.textAlign = "center";
  const fit = fitLines(ctx, name, 800, 7.4 * u, 4 * u, W - 16 * u, 2);
  ctx.fillStyle = INK;
  fit.lines.forEach((line, i) => ctx.fillText(line, W / 2, 31 * u + i * fit.px * 1.2));

  drawQr(ctx, matrix, (W - 62 * u) / 2, 50 * u, 62 * u);
  ctx.fillStyle = INK;
  ctx.font = font(800, 4.4 * u);
  ctx.fillText(POSTER_TAGLINE, W / 2, 124 * u);
  ctx.font = font(600, 3.2 * u);
  ctx.fillText(display, W / 2, 132 * u);
};

const drawBranded = (ctx, W, H, { name, tagline, logo, matrix, display }) => {
  const u = W / 100;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, 42 * u);
  ctx.fillStyle = BLUE;
  ctx.fillRect(0, 42 * u, W, 2 * u);
  drawLogo(ctx, logo, name, W / 2, 13 * u, 8 * u);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  const fit = fitLines(ctx, name, 800, 6.4 * u, 3.6 * u, W - 14 * u, 2);
  fit.lines.forEach((line, i) => ctx.fillText(line, W / 2, 28 * u + i * fit.px * 1.18));
  if (tagline && fit.lines.length === 1) {
    const t = fitLines(ctx, tagline, 500, 3.2 * u, 2.4 * u, W - 20 * u, 1);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(t.lines[0], W / 2, 36.5 * u);
  }

  ctx.fillStyle = BLUE;
  roundRect(ctx, (W - 66 * u) / 2, 52 * u, 66 * u, 66 * u, 4 * u);
  ctx.fill();
  drawQr(ctx, matrix, (W - 58 * u) / 2, 56 * u, 58 * u);

  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.font = font(800, 4.6 * u);
  ctx.fillText(POSTER_TAGLINE, W / 2, 128 * u);

  ctx.fillStyle = INK;
  ctx.fillRect(0, H - 11 * u, W, 11 * u);
  drawBrandMark(ctx, 6 * u, H - 8.5 * u, 6 * u);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.font = font(800, 4 * u);
  ctx.fillText("EpicMKT", 14 * u, H - 3.9 * u);
  ctx.textAlign = "right";
  ctx.font = font(600, 3 * u);
  ctx.fillText(display, W - 6 * u, H - 4 * u);
};

export const renderPoster = async ({ size, style, name, tagline, logo, matrix, display, env }) => {
  const [W, H] = POSTER_SIZES[size].px;
  await env.prepare?.();
  const canvas = env.createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const args = { name, tagline, logo, matrix, display };
  if (style === "branded") drawBranded(ctx, W, H, args);
  else drawPlain(ctx, W, H, args);
  return canvas;
};

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

export const pngWithDpi = (bytes, dpi = 300) => {
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4);
  view.setUint32(8, ppm);
  view.setUint32(12, ppm);
  chunk[16] = 1;
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  const ihdrEnd = 8 + 8 + 13 + 4;
  const out = new Uint8Array(bytes.length + chunk.length);
  out.set(bytes.subarray(0, ihdrEnd), 0);
  out.set(chunk, ihdrEnd);
  out.set(bytes.subarray(ihdrEnd), ihdrEnd + chunk.length);
  return out;
};

export const pngBytes = async (canvas, env) => pngWithDpi(await env.toPng(canvas), 300);

export const buildPdf = async (png, size) => {
  const { jsPDF } = await import("jspdf");
  const [w, h] = POSTER_SIZES[size].mm;
  const doc = new jsPDF({ unit: "mm", format: [w, h], orientation: "portrait", compress: true });
  doc.addImage(png, "PNG", 0, 0, w, h, undefined, "FAST");
  return new Uint8Array(doc.output("arraybuffer"));
};

export const browserEnv = {
  prepare: async () => {
    try {
      await Promise.all([document.fonts.load(font(800, 40)), document.fonts.load(font(600, 40)), document.fonts.load(font(500, 40))]);
    } catch {
      return;
    }
  },
  createCanvas: (w, h) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  },
  toPng: (canvas) =>
    new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? b.arrayBuffer().then((x) => resolve(new Uint8Array(x))) : reject(new Error("png_failed"))), "image/png")
    ),
};

export const loadLogo = (url) =>
  new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });

export const posterFileName = (slug, size, ext) => `epicmkt-${slug}-qr-${size.toLowerCase()}.${ext}`;
