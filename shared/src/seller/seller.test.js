import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { passwordProblems, isStrongPassword } from "./password.js";
import { sniffMedia, imageSize, videoInfo, inspectMedia, MEDIA_RULES } from "./media.js";

const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const str = (s) => [...s].map((c) => c.charCodeAt(0));
const png = (w, h) => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), ...str("IHDR"), ...be32(w), ...be32(h), 8, 6, 0, 0, 0]);
const jpeg = (w, h) => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0]);
const webpX = (w, h) => {
  const le24 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];
  return Uint8Array.from([...str("RIFF"), 22, 0, 0, 0, ...str("WEBP"), ...str("VP8X"), 10, 0, 0, 0, 0, 0, 0, 0, ...le24(w - 1), ...le24(h - 1)]);
};
const box = (name, ...parts) => {
  const body = parts.flat();
  return [...be32(body.length + 8), ...str(name), ...body];
};
const mp4 = (w, h, seconds, scale = 1000) => {
  const mvhd = box("mvhd", [0, 0, 0, 0], be32(0), be32(0), be32(scale), be32(seconds * scale), new Array(80).fill(0));
  const tkhd = box("tkhd", [0, 0, 0, 3], be32(0), be32(0), be32(1), be32(0), be32(seconds * scale), new Array(8).fill(0), [0, 0, 0, 0, 0, 0, 0, 0], new Array(36).fill(0), be32(w * 65536), be32(h * 65536));
  return Uint8Array.from([...box("ftyp", str("isom"), be32(0), str("isom")), ...box("moov", mvhd, box("trak", tkhd)), ...box("mdat", [1, 2, 3, 4])]);
};
const ebml = (idBytes, payload) => {
  const size = payload.length;
  return [...idBytes, 0x80 | size, ...payload];
};
const ebmlBig = (idBytes, payload) => [...idBytes, 0x40 | (payload.length >> 8), payload.length & 255, ...payload];
const webm = (w, h, seconds) => {
  const dur = new Uint8Array(4);
  new DataView(dur.buffer).setFloat32(0, seconds * 1000);
  const info = ebml([0x15, 0x49, 0xa9, 0x66], [...ebml([0x2a, 0xd7, 0xb1], be32(1000000)), ...ebml([0x44, 0x89], [...dur])]);
  const video = ebml([0xe0], [...ebml([0xb0], [w >> 8, w & 255]), ...ebml([0xba], [h >> 8, h & 255])]);
  const tracks = ebml([0x16, 0x54, 0xae, 0x6b], ebml([0xae], video));
  const header = [0x1a, 0x45, 0xdf, 0xa3, 0x87, 0x42, 0x82, 0x84, ...str("webm")];
  return Uint8Array.from([...header, ...ebmlBig([0x18, 0x53, 0x80, 0x67], [...info, ...tracks])]);
};
const pad = (bytes, n) => Uint8Array.from([...bytes, ...new Array(Math.max(0, n - bytes.length)).fill(0)]);

test("password rules", () => {
  assert.deepEqual(passwordProblems("Abcdefgh12"), []);
  assert.deepEqual(passwordProblems("short1A"), ["too_short"]);
  assert.ok(passwordProblems("alllowercase1").includes("no_upper"));
  assert.ok(passwordProblems("ALLUPPERCASE1").includes("no_lower"));
  assert.ok(passwordProblems("NoNumbersHere").includes("no_number"));
  assert.ok(passwordProblems("x".repeat(129) + "A1").includes("too_long"));
  assert.ok(passwordProblems("Es10000123", { sellerId: "ES10000123" }).includes("is_seller_id"));
  assert.ok(passwordProblems("0712345678", { phone: "+254712345678" }).includes("is_phone"));
  assert.ok(passwordProblems("254712345678", { phone: "0712345678" }).includes("is_phone"));
  assert.ok(passwordProblems("712345678a", { phone: "0712345678" }).length > 0 === true);
  assert.equal(isStrongPassword("Abcdefgh12", { sellerId: "ES1", phone: "0712345678" }), true);
});

test("real type is read from magic bytes, not names", () => {
  assert.equal(sniffMedia(png(300, 300)).type, "png");
  assert.equal(sniffMedia(jpeg(300, 300)).type, "jpg");
  assert.equal(sniffMedia(webpX(300, 300)).type, "webp");
  assert.equal(sniffMedia(mp4(640, 480, 5)).type, "mp4");
  assert.equal(sniffMedia(webm(640, 480, 5)).type, "webm");
  assert.equal(sniffMedia(Uint8Array.from(str("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))), null);
  assert.equal(sniffMedia(Uint8Array.from(str("%PDF-1.7 padding padding"))), null);
  assert.equal(sniffMedia(Uint8Array.from([...be32(24), ...str("ftypqt  "), ...new Array(12).fill(0)])), null);
  assert.equal(sniffMedia(new Uint8Array(4)), null);
});

test("image sizes", () => {
  assert.deepEqual(imageSize(png(640, 480), "png"), { width: 640, height: 480 });
  assert.deepEqual(imageSize(jpeg(1024, 768), "jpg"), { width: 1024, height: 768 });
  assert.deepEqual(imageSize(webpX(1200, 900), "webp"), { width: 1200, height: 900 });
});

test("video info", () => {
  const m = videoInfo(mp4(1280, 720, 12), "mp4");
  assert.deepEqual([m.width, m.height, m.durationSec], [1280, 720, 12]);
  const w = videoInfo(webm(854, 480, 7), "webm");
  assert.deepEqual([w.width, w.height, Math.round(w.durationSec)], [854, 480, 7]);
});

test("inspectMedia enforces size, dimensions and duration", () => {
  assert.equal(inspectMedia(png(640, 480)).ok, true);
  assert.equal(inspectMedia(png(100, 480)).reason, "too_small");
  assert.equal(inspectMedia(png(9000, 480)).reason, "too_big_dimensions");
  assert.equal(inspectMedia(pad(png(640, 480), MEDIA_RULES.imageMaxBytes + 1)).reason, "too_large");
  assert.equal(inspectMedia(pad(mp4(640, 480, 5), MEDIA_RULES.videoMaxBytes + 1)).reason, "too_large");
  const ok = inspectMedia(mp4(640, 480, 12));
  assert.deepEqual([ok.ok, ok.kind, ok.width, ok.height, ok.durationSec], [true, "video", 640, 480, 12]);
  assert.equal(inspectMedia(mp4(640, 480, 61)).reason, "too_long");
  assert.equal(inspectMedia(Uint8Array.from(str("not a media file at all"))).reason, "unsupported_type");
  assert.equal(inspectMedia(Uint8Array.from([...str("RIFF"), 4, 0, 0, 0, ...str("WEBP"), ...str("VP8X"), 0, 0, 0, 0])).reason, "unreadable");
});

test("synced copies in the edge functions match the shared source", () => {
  execFileSync("node", ["scripts/sync-shared.mjs", "--check"], { cwd: new URL("../../../", import.meta.url) });
});
