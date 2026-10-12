import { test } from "node:test";
import assert from "node:assert/strict";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import jsQR from "jsqr";
import { POSTER_SIZES, qrUrl } from "@epicmkt/shared";
import { loadQr, renderPoster, pngBytes, pngWithDpi, buildPdf } from "./poster.js";

const env = { createCanvas, toPng: async (c) => new Uint8Array(await c.encode("png")) };

const link = qrUrl("https://epicmkt.co.ke", "salon-prem");

const logoCanvas = () => {
  const c = createCanvas(300, 300);
  const x = c.getContext("2d");
  x.fillStyle = "#c2410c";
  x.fillRect(0, 0, 300, 300);
  return c;
};

const decode = async (png, W, H, width = 1100) => {
  const img = await loadImage(Buffer.from(png));
  const w = width;
  const h = Math.round((H / W) * width);
  const c = createCanvas(w, h);
  const x = c.getContext("2d");
  x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h);
  return jsQR(d.data, d.width, d.height);
};

const pngSize = (b) => {
  const v = new DataView(b.buffer, b.byteOffset);
  return [v.getUint32(16), v.getUint32(20)];
};

const findChunk = (b, type) => {
  let i = 8;
  while (i < b.length) {
    const len = new DataView(b.buffer, b.byteOffset).getUint32(i);
    const name = String.fromCharCode(...b.subarray(i + 4, i + 8));
    if (name === type) return b.subarray(i + 8, i + 8 + len);
    i += 12 + len;
  }
  return null;
};

for (const size of ["A4", "A5"]) {
  for (const style of ["plain", "branded"]) {
    test(`${size} ${style} poster: exact size, 300 dpi, QR decodes to the shop link`, async () => {
      const matrix = await loadQr(link);
      const canvas = await renderPoster({
        size, style, name: "Salon Prem and Beauty Studio", tagline: "Braids, locs and bridal styling", logo: style === "branded" ? logoCanvas() : null,
        matrix, display: "epicmkt.co.ke/s/salon-prem", env,
      });
      const [W, H] = POSTER_SIZES[size].px;
      const png = await pngBytes(canvas, env);
      assert.deepEqual(pngSize(png), [W, H]);
      const phys = findChunk(png, "pHYs");
      const v = new DataView(phys.buffer, phys.byteOffset);
      assert.equal(v.getUint32(0), 11811);
      assert.equal(v.getUint32(4), 11811);
      assert.equal(phys[8], 1);
      assert.ok(Math.abs((W / 11811) * 1000 - POSTER_SIZES[size].mm[0]) < 0.1);
      const code = await decode(png, W, H);
      assert.ok(code, "QR code found in poster");
      assert.equal(code.data, link);
      const pdf = await buildPdf(png, size);
      const text = Buffer.from(pdf).toString("latin1");
      const [mmW, mmH] = POSTER_SIZES[size].mm;
      const box = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(text);
      assert.ok(box, "MediaBox present");
      assert.ok(Math.abs(Number(box[1]) - (mmW / 25.4) * 72) < 0.1);
      assert.ok(Math.abs(Number(box[2]) - (mmH / 25.4) * 72) < 0.1);
      assert.equal(text.slice(0, 5), "%PDF-");
    });
  }
}

test("PNG dpi chunk keeps the file valid and sits right after IHDR", async () => {
  const c = createCanvas(40, 40);
  const raw = new Uint8Array(await c.encode("png"));
  const out = pngWithDpi(raw, 300);
  assert.equal(out.length, raw.length + 21);
  assert.equal(String.fromCharCode(...out.subarray(37, 41)), "pHYs");
  const img = await loadImage(Buffer.from(out));
  assert.equal(img.width, 40);
});

test("a poster carries only the public link: no personal data in the QR", async () => {
  const matrix = await loadQr(link);
  const canvas = await renderPoster({ size: "A5", style: "plain", name: "Shop", matrix, display: "epicmkt.co.ke/s/salon-prem", env });
  const png = await pngBytes(canvas, env);
  const code = await decode(png, 1748, 2480);
  assert.equal(code.data, "https://epicmkt.co.ke/s/salon-prem?src=qr");
  assert.ok(!/@|\+254|ES\d{6}/.test(code.data));
});

test("long names and a missing logo still render a readable poster", async () => {
  const matrix = await loadQr(link);
  const canvas = await renderPoster({
    size: "A4", style: "branded", name: "The Extraordinarily Long Named Beauty Salon and Barbershop of Maseno Town Centre", tagline: "x", logo: null, matrix, display: "epicmkt.co.ke/s/salon-prem", env,
  });
  const png = await pngBytes(canvas, env);
  const code = await decode(png, 2480, 3508);
  assert.equal(code.data, link);
});
