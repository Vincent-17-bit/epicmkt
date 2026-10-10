import { inspectMedia } from "@epicmkt/shared";

const IMAGE_PROBLEMS = {
  unsupported_type: "Use a JPG, PNG or WebP image.",
  too_large: "That image is larger than 10 MB.",
  too_small: "That image is too small. Use one at least 200 pixels on each side.",
  too_big_dimensions: "That image is too large. Use one under 8000 pixels on each side.",
  unreadable: "We could not read that image. Try another file.",
};

/** Check the real bytes of a picked file (not just its extension). Resolves to { ok, reason?, message? }. */
export async function checkImageFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = inspectMedia(bytes);
  if (info.ok && info.kind !== "image") return { ok: false, reason: "unsupported_type", message: IMAGE_PROBLEMS.unsupported_type };
  return info.ok ? info : { ...info, message: IMAGE_PROBLEMS[info.reason] ?? IMAGE_PROBLEMS.unreadable };
}

const DOC_MAX = 10 * 1024 * 1024;

/** Licence documents: PDF, JPG, PNG or WebP up to 10 MB, judged by the file's first bytes. */
export async function checkDocFile(file) {
  if (file.size > DOC_MAX) return { ok: false, message: "That file is larger than 10 MB." };
  if (file.size < 12) return { ok: false, message: "That file looks empty." };
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = String.fromCharCode(...head.slice(0, 5));
  if (ascii === "%PDF-") return { ok: true, mime: "application/pdf" };
  const img = inspectMedia(new Uint8Array(await file.arrayBuffer()));
  if (img.ok && img.kind === "image") return { ok: true, mime: img.mime };
  return { ok: false, message: "Use a PDF, JPG, PNG or WebP file." };
}

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("unreadable"));
    img.src = url;
  });
}

/** Where the crop window sits in the source image, given the on-screen frame, zoom and offset. */
export function cropRect({ imgW, imgH, frameW, frameH, zoom, offset }) {
  const base = Math.max(frameW / imgW, frameH / imgH);
  const scale = base * zoom;
  const left = frameW / 2 - (imgW * scale) / 2 + offset.x;
  const top = frameH / 2 - (imgH * scale) / 2 + offset.y;
  return { sx: -left / scale, sy: -top / scale, sw: frameW / scale, sh: frameH / scale, scale };
}

/** Largest allowed drag in each direction so the picture always covers the frame. */
export function clampOffset({ imgW, imgH, frameW, frameH, zoom, offset }) {
  const scale = Math.max(frameW / imgW, frameH / imgH) * zoom;
  const maxX = Math.max(0, (imgW * scale - frameW) / 2);
  const maxY = Math.max(0, (imgH * scale - frameH) / 2);
  return { x: Math.min(maxX, Math.max(-maxX, offset.x)), y: Math.min(maxY, Math.max(-maxY, offset.y)) };
}

export function renderCrop(img, rect, outW, outH) {
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, outW, outH);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode_failed"))), "image/webp", 0.9));
}
