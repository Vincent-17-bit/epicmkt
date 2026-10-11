// Byte-level sample files for tests only (not exported from the package index). They are just big enough to pass the
// same readers the server uses, so a test can hand a "photo" to the real inspection code without needing real pixels.

export const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
export const str = (s) => [...s].map((c) => c.charCodeAt(0));
const le24 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];

export const png = (w, h) => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), ...str("IHDR"), ...be32(w), ...be32(h), 8, 6, 0, 0, 0]);

// A JPEG header that the size reader accepts. exif adds an APP1 block carrying GPS text, the way a phone photo does.
export const jpeg = (w, h, { exif = false } = {}) => {
  const app1 = exif ? [0xff, 0xe1, 0, 0, ...str("Exif"), 0, 0, ...str("MM*GPSLatitude=-1.2921;GPSLongitude=36.8219;Make=PhoneCo")] : [];
  if (exif) { const len = app1.length - 2; app1[2] = len >> 8; app1[3] = len & 255; }
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, ...app1, 0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0]);
};

export const webp = (w, h) => Uint8Array.from([...str("RIFF"), 22, 0, 0, 0, ...str("WEBP"), ...str("VP8X"), 10, 0, 0, 0, 0, 0, 0, 0, ...le24(w - 1), ...le24(h - 1)]);

const box = (name, ...parts) => {
  const body = parts.flat();
  return [...be32(body.length + 8), ...str(name), ...body];
};

// codec: "h264" (avc1), "hevc" (hvc1) or null for none. brand "qt  " makes a QuickTime .mov.
export const mp4 = (w, h, seconds, { scale = 1000, codec = "h264", brand = "isom" } = {}) => {
  const mvhd = box("mvhd", [0, 0, 0, 0], be32(0), be32(0), be32(scale), be32(Math.round(seconds * scale)), new Array(80).fill(0));
  const tkhd = box("tkhd", [0, 0, 0, 3], be32(0), be32(0), be32(1), be32(0), be32(Math.round(seconds * scale)), new Array(8).fill(0), [0, 0, 0, 0, 0, 0, 0, 0], new Array(36).fill(0), be32(w * 65536), be32(h * 65536));
  const entry = codec === "hevc" ? "hvc1" : codec === "h264" ? "avc1" : null;
  const stsd = entry ? box("mdia", box("minf", box("stbl", box("stsd", [0, 0, 0, 0], be32(1), box(entry, new Array(8).fill(0)))))) : [];
  return Uint8Array.from([...box("ftyp", str(brand), be32(0), str(brand)), ...box("moov", mvhd, box("trak", tkhd, stsd)), ...box("mdat", [1, 2, 3, 4])]);
};
export const mov = (w, h, seconds, o = {}) => mp4(w, h, seconds, { ...o, brand: "qt  " });

// An iPhone photo: an ISO-BMFF file whose brand is heic.
export const heic = () => Uint8Array.from([...be32(24), ...str("ftypheic"), ...be32(0), ...str("mif1"), ...new Array(32).fill(0)]);

const ebml = (id, payload) => [...id, 0x80 | payload.length, ...payload];
const ebmlBig = (id, payload) => [...id, 0x40 | (payload.length >> 8), payload.length & 255, ...payload];
export const webm = (w, h, seconds) => {
  const dur = new Uint8Array(4);
  new DataView(dur.buffer).setFloat32(0, seconds * 1000);
  const info = ebml([0x15, 0x49, 0xa9, 0x66], [...ebml([0x2a, 0xd7, 0xb1], be32(1000000)), ...ebml([0x44, 0x89], [...dur])]);
  const video = ebml([0xe0], [...ebml([0xb0], [w >> 8, w & 255]), ...ebml([0xba], [h >> 8, h & 255])]);
  const tracks = ebmlBig([0x16, 0x54, 0xae, 0x6b], ebml([0xae], video));
  const header = [0x1a, 0x45, 0xdf, 0xa3, 0x87, 0x42, 0x82, 0x84, ...str("webm")];
  return Uint8Array.from([...header, ...ebmlBig([0x18, 0x53, 0x80, 0x67], [...info, ...tracks])]);
};

export const pad = (bytes, n) => Uint8Array.from([...bytes, ...new Array(Math.max(0, n - bytes.length)).fill(0)]);

// Files that pretend to be something else. Their names say image or video; their bytes say otherwise.
export const disguised = {
  exe: () => Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff, 0, 0, ...new Array(48).fill(0)]),
  svg: () => Uint8Array.from(str("<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'></svg>")),
  html: () => Uint8Array.from(str("<!doctype html><script>alert(1)</script>")),
  pdf: () => Uint8Array.from(str("%PDF-1.7 padding padding padding")),
  zip: () => Uint8Array.from([0x50, 0x4b, 3, 4, ...new Array(40).fill(0)]),
  gif: () => Uint8Array.from([...str("GIF89a"), 1, 0, 1, 0, ...new Array(40).fill(0)]),
};

// True when the bytes still carry camera metadata. Used to prove the browser re-encode removed it.
export const hasMetadata = (bytes) => {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + 8192)));
  return /Exif|GPSLatitude|GPSLongitude|Make=|XMP|<x:xmpmeta|ICC_PROFILE/.test(text);
};
