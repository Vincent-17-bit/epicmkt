import { MEDIA_RULES, sniffMedia } from "@epicmkt/shared";

export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_SIDE = 1600;
const QUALITY = 0.82;

const fail = (code) => Object.assign(new Error(code), { code });

export const imageErrorMessage = (e) =>
  ({
    unsupported_type: "Use a JPEG, PNG or WebP photo.",
    too_large: `Photos can be up to ${Math.round(MEDIA_RULES.imageMaxBytes / 1048576)} MB.`,
    too_small: `Photos need at least ${MEDIA_RULES.minSide} pixels on each side.`,
    decode_failed: "That photo could not be opened.",
  })[e?.code] ?? null;

const canvasFor = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

const toBlob = (canvas) =>
  new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(fail("decode_failed"))), "image/webp", QUALITY));

export const processImage = async (file) => {
  if (file.size > MEDIA_RULES.imageMaxBytes) throw fail("too_large");
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const sniffed = sniffMedia(head);
  if (!sniffed || sniffed.kind !== "image") throw fail("unsupported_type");
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw fail("decode_failed");
  }
  if (Math.min(bitmap.width, bitmap.height) < MEDIA_RULES.minSide) throw fail("too_small");
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = canvasFor(width, height);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await toBlob(canvas);
  return { blob, width, height, previewUrl: URL.createObjectURL(blob) };
};
