export const MEDIA_MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime" };

// What a stored object must satisfy. The browser applies friendlier, stricter checks first (see media-model.js);
// these are the limits the server enforces on whatever actually arrives.
export const MEDIA_RULES = {
  imageMaxBytes: 10 * 1024 * 1024,
  videoMaxBytes: 25 * 1024 * 1024,
  minSide: 200,
  minLongSide: 600,
  maxSide: 8000,
  videoMaxSeconds: 45,
  variantMinWidth: 16,
};

// Responsive widths the browser produces. 2000 is only made when the source is at least that wide, for zoom.
export const IMAGE_WIDTHS = [320, 640, 960, 1280, 1600];
export const ZOOM_WIDTH = 2000;
export const MAX_MEDIA_OBJECTS = 9;

// Widths to produce for a source: the standard ones that do not upscale, plus the source's own width when it falls
// between two of them (so the top variant is always the original resolution, up to 1600).
export function variantWidthsFor(sourceWidth) {
  const w = Math.floor(sourceWidth);
  if (!(w > 0)) return [];
  const out = IMAGE_WIDTHS.filter((x) => x <= w);
  if (w < IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1] && !out.includes(w)) out.push(w);
  if (w >= ZOOM_WIDTH) out.push(ZOOM_WIDTH);
  return out;
}

// Every stored object lives at <business_id>/<item_id>/<media_id>/<file>. One folder per media, so removing a media
// removes exactly one folder and one item can never reach into another's files.
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === "string" && UUID.test(v);

export const mediaFolder = ({ businessId, itemId, mediaId }) => `${businessId}/${itemId}/${mediaId}`;
export const mediaObjectPath = (ids, file) => `${mediaFolder(ids)}/${file}`;

// null when the path is not shaped like an object this business owns for this item; otherwise its parts.
export function parseMediaPath(path, { businessId, itemId } = {}) {
  if (typeof path !== "string" || path.length > 300 || path.includes("..") || path.includes("\\") || path.startsWith("/")) return null;
  const parts = path.split("/");
  if (parts.length !== 4) return null;
  const [biz, item, media, file] = parts;
  if (businessId !== undefined && biz !== businessId) return null;
  if (itemId !== undefined && item !== itemId) return null;
  if (!isUuid(media) || !FILE_NAME.test(file)) return null;
  return { businessId: biz, itemId: item, mediaId: media, file, folder: `${biz}/${item}/${media}` };
}

const at = (b, i, ...v) => v.every((x, k) => b[i + k] === x);
const ascii = (b, i, n) => String.fromCharCode(...b.slice(i, i + n));
const u16be = (b, i) => (b[i] << 8) | b[i + 1];
const u16le = (b, i) => b[i] | (b[i + 1] << 8);
const u32be = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u64be = (b, i) => u32be(b, i) * 4294967296 + u32be(b, i + 4);

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);

export function sniffMedia(b) {
  if (!b || b.length < 12) return null;
  let type = null;
  if (at(b, 0, 0xff, 0xd8, 0xff)) type = "jpg";
  else if (at(b, 0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) type = "png";
  else if (at(b, 0, 0x52, 0x49, 0x46, 0x46) && at(b, 8, 0x57, 0x45, 0x42, 0x50)) type = "webp";
  else if (ascii(b, 4, 4) === "ftyp") {
    const brand = ascii(b, 8, 4);
    if (brand === "qt  ") type = "mov";
    else if (HEIF_BRANDS.has(brand)) type = "heic";
    else if (brand === "avif" || brand === "avis") type = "avif";
    else type = "mp4";
  }
  else if (at(b, 0, 0x1a, 0x45, 0xdf, 0xa3) && ascii(b, 0, Math.min(b.length, 64)).includes("webm")) type = "webm";
  if (!type) return null;
  if (type === "heic" || type === "avif") return { type, kind: "image", mime: type === "heic" ? "image/heic" : "image/avif", accepted: false };
  return { type, kind: type === "mp4" || type === "webm" || type === "mov" ? "video" : "image", mime: MEDIA_MIME[type], accepted: true };
}

function pngSize(b) {
  if (b.length < 24 || ascii(b, 12, 4) !== "IHDR") return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

function jpegSize(b) {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i += 1; continue; }
    const m = b[i + 1];
    if (m === 0xff) { i += 1; continue; }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = u16be(b, i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { height: u16be(b, i + 5), width: u16be(b, i + 7) };
    i += 2 + len;
  }
  return null;
}

function webpSize(b) {
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8X" && b.length >= 30) return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
  if (chunk === "VP8L" && b.length >= 25 && b[20] === 0x2f) {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
  }
  if (chunk === "VP8 " && b.length >= 30 && at(b, 23, 0x9d, 0x01, 0x2a)) return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  return null;
}

export function imageSize(b, type) {
  if (type === "png") return pngSize(b);
  if (type === "jpg") return jpegSize(b);
  if (type === "webp") return webpSize(b);
  return null;
}

function boxes(b, start, end) {
  const out = [];
  let i = start;
  while (i + 8 <= end) {
    let size = u32be(b, i);
    const name = ascii(b, i + 4, 4);
    let head = 8;
    if (size === 1) { size = u64be(b, i + 8); head = 16; }
    else if (size === 0) size = end - i;
    if (size < head || i + size > end) break;
    out.push({ name, start: i + head, end: i + size });
    i += size;
  }
  return out;
}

function mp4Info(b) {
  const moov = boxes(b, 0, b.length).find((x) => x.name === "moov");
  if (!moov) return null;
  const inner = boxes(b, moov.start, moov.end);
  const mvhd = inner.find((x) => x.name === "mvhd");
  let durationSec = null;
  if (mvhd) {
    const v = b[mvhd.start];
    const scale = u32be(b, mvhd.start + (v === 1 ? 20 : 12));
    const dur = v === 1 ? u64be(b, mvhd.start + 24) : u32be(b, mvhd.start + 16);
    if (scale > 0) durationSec = dur / scale;
  }
  let width = null;
  let height = null;
  for (const trak of inner.filter((x) => x.name === "trak")) {
    const tkhd = boxes(b, trak.start, trak.end).find((x) => x.name === "tkhd");
    if (!tkhd) continue;
    const off = tkhd.start + (b[tkhd.start] === 1 ? 88 : 76);
    if (off + 8 > tkhd.end) continue;
    const w = u32be(b, off) / 65536;
    const h = u32be(b, off + 4) / 65536;
    if (w > 0 && h > 0) { width = Math.round(w); height = Math.round(h); break; }
  }
  return { width, height, durationSec };
}

const EBML_MASTER = new Set([0x18538067, 0x1549a966, 0x1654ae6b, 0xae, 0xe0]);

function vint(b, i, keepMarker) {
  const first = b[i];
  if (first === undefined || first === 0) return null;
  let len = 1;
  while (!(first & (0x80 >> (len - 1)))) len += 1;
  if (len > 8 || i + len > b.length) return null;
  let value = keepMarker ? first : first & (0xff >> len);
  let unknown = !keepMarker && (first & (0xff >> len)) === (0xff >> len);
  for (let k = 1; k < len; k++) {
    value = value * 256 + b[i + k];
    if (!keepMarker && b[i + k] !== 0xff) unknown = false;
  }
  return { value, len, unknown };
}

function webmInfo(b) {
  const info = { scale: 1000000, duration: null, width: null, height: null };
  const walk = (start, end) => {
    let i = start;
    while (i < end) {
      const id = vint(b, i, true);
      if (!id) return;
      const size = vint(b, i + id.len, false);
      if (!size) return;
      const dataStart = i + id.len + size.len;
      const dataEnd = size.unknown ? end : Math.min(end, dataStart + size.value);
      if (EBML_MASTER.has(id.value)) walk(dataStart, dataEnd);
      else if (id.value === 0x2ad7b1) { let v = 0; for (let k = dataStart; k < dataEnd; k++) v = v * 256 + b[k]; info.scale = v; }
      else if (id.value === 0x4489) {
        const dv = new DataView(b.buffer, b.byteOffset + dataStart, dataEnd - dataStart);
        info.duration = dataEnd - dataStart === 8 ? dv.getFloat64(0) : dataEnd - dataStart === 4 ? dv.getFloat32(0) : null;
      } else if (id.value === 0xb0 || id.value === 0xba) {
        let v = 0;
        for (let k = dataStart; k < dataEnd; k++) v = v * 256 + b[k];
        if (id.value === 0xb0 && !info.width) info.width = v;
        if (id.value === 0xba && !info.height) info.height = v;
      }
      i = dataEnd;
    }
  };
  walk(0, b.length);
  return { width: info.width, height: info.height, durationSec: info.duration === null ? null : (info.duration * info.scale) / 1e9 };
}

export function videoInfo(b, type) {
  if (type === "mp4" || type === "mov") return mp4Info(b);
  if (type === "webm") return webmInfo(b);
  return null;
}

// Which video codec a file carries, read from the sample-entry names. A byte scan is enough here: these four-letter
// names only appear in the sample description, and a false positive needs the same bytes inside the pixel data.
// "hevc" means H.265, which most desktop browsers cannot play, so it is kept out of the shopper gallery.
export function videoCodec(b, type) {
  if (type === "webm") return ascii(b, 0, Math.min(b.length, 4096)).includes("V_VP9") ? "vp9" : ascii(b, 0, Math.min(b.length, 4096)).includes("V_AV1") ? "av1" : "vp8";
  const text = typeof b === "string" ? b : latin1(b);
  if (text.includes("avc1") || text.includes("avc3")) return "h264";
  if (text.includes("hvc1") || text.includes("hev1")) return "hevc";
  return "unknown";
}

function latin1(b) {
  let out = "";
  for (let i = 0; i < b.length; i += 32768) out += String.fromCharCode(...b.subarray(i, Math.min(b.length, i + 32768)));
  return out;
}

export function inspectMedia(bytes) {
  const sniff = sniffMedia(bytes);
  if (!sniff || sniff.accepted === false) return { ok: false, reason: "unsupported_type" };
  const size = bytes.length;
  const max = sniff.kind === "image" ? MEDIA_RULES.imageMaxBytes : MEDIA_RULES.videoMaxBytes;
  if (size > max) return { ok: false, reason: "too_large" };
  if (sniff.kind === "image") {
    const dim = imageSize(bytes, sniff.type);
    if (!dim) return { ok: false, reason: "unreadable" };
    const { minSide, maxSide } = MEDIA_RULES;
    if (dim.width < minSide || dim.height < minSide || Math.max(dim.width, dim.height) < MEDIA_RULES.minLongSide) return { ok: false, reason: "too_small" };
    if (dim.width > maxSide || dim.height > maxSide) return { ok: false, reason: "too_big_dimensions" };
    return { ok: true, ...sniff, ...dim, durationSec: null, size };
  }
  const info = videoInfo(bytes, sniff.type);
  if (!info || !info.width || !info.height || info.durationSec === null || !Number.isFinite(info.durationSec)) return { ok: false, reason: "unreadable" };
  if (info.durationSec > MEDIA_RULES.videoMaxSeconds) return { ok: false, reason: "too_long" };
  if (info.width > MEDIA_RULES.maxSide || info.height > MEDIA_RULES.maxSide) return { ok: false, reason: "too_big_dimensions" };
  return { ok: true, ...sniff, width: info.width, height: info.height, durationSec: Math.round(info.durationSec * 100) / 100, size, codec: videoCodec(bytes, sniff.type) };
}

// Responsive variants, posters and placeholders are small by design, so they skip the main-image minimums.
// They still have to be a real JPEG, PNG or WebP of sane size; the declared type is never used.
export function inspectVariant(bytes, { maxBytes = 3 * 1024 * 1024 } = {}) {
  const sniff = sniffMedia(bytes);
  if (!sniff || sniff.kind !== "image" || sniff.accepted === false) return { ok: false, reason: "unsupported_type" };
  if (bytes.length > maxBytes) return { ok: false, reason: "too_large" };
  const dim = imageSize(bytes, sniff.type);
  if (!dim) return { ok: false, reason: "unreadable" };
  if (dim.width < MEDIA_RULES.variantMinWidth || dim.height < 1 || dim.width > MEDIA_RULES.maxSide || dim.height > MEDIA_RULES.maxSide) return { ok: false, reason: "too_big_dimensions" };
  return { ok: true, ...sniff, ...dim, size: bytes.length };
}
