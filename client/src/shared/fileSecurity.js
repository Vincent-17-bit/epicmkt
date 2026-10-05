import { ALLOWED_EXT, MAX_FILES, MIME_BY_KIND, SLOT_LIMITS } from './validators';

export function sniff(bytes) {
  const at = (i, ...v) => v.every((x, k) => bytes[i + k] === x);
  if (at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return 'pdf';
  if (at(0, 0xff, 0xd8, 0xff)) return 'jpg';
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'webp';
  return null;
}

export function isBlocked(bytes) {
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 64)).trimStart().toLowerCase();
  return /^(<|pk|mz|#!|\x7felf|\x1f\x8b|rar|7z)/.test(head) || head.startsWith('%!ps');
}

export function isHeic(bytes) {
  const brand = new TextDecoder('latin1').decode(bytes.slice(4, 12));
  return /^ftyp(heic|heix|heim|heis|hevc|mif1|msf1)/.test(brand);
}

export function checkFileCount(count) {
  return count <= MAX_FILES ? { ok: true } : { ok: false, reason: 'too_many', message: FILE_ERRORS.too_many };
}

const PDF_BAD = ['/Encrypt', '/JavaScript', '/JS', '/OpenAction', '/AA', '/Launch', '/EmbeddedFile', '/RichMedia'];

export function pdfIsSafe(bytes) {
  const text = new TextDecoder('latin1').decode(bytes);
  return !PDF_BAD.some((k) => text.includes(k));
}

export const FILE_ERRORS = {
  empty: 'This file is empty.',
  too_large: 'This file is too large.',
  bad_extension: 'Use a PDF, JPG, PNG or WebP file.',
  wrong_type: 'This file is not a real PDF or image.',
  unsafe_pdf: 'This PDF contains scripts or protection and cannot be used. Save it as a plain PDF or upload a photo instead.',
  blocked_type: 'SVG, HTML, Office, ZIP and program files are not accepted. Use a PDF, JPG, PNG or WebP file.',
  heic_unsupported: 'This browser cannot read HEIC photos. Take the photo as JPG or share it as JPG, then try again.',
  too_many: `You can upload at most ${MAX_FILES} files in total.`,
  unreadable: 'We could not read this file. Try another one.',
};

function readBytes(blob) {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer().then((b) => new Uint8Array(b));
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(blob);
  });
}

const extOf = (name) => String(name ?? '').split('.').pop().toLowerCase();

export async function inspectFile(file) {
  if (!file || file.size === 0) return { ok: false, reason: 'empty' };
  let bytes;
  try {
    bytes = await readBytes(file);
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  if (isBlocked(bytes)) return { ok: false, reason: 'blocked_type' };
  if (isHeic(bytes)) {
    if (!['heic', 'heif'].includes(extOf(file.name))) return { ok: false, reason: 'bad_extension' };
    if (bytes.length > SLOT_LIMITS.image) return { ok: false, reason: 'too_large' };
    return { ok: true, kind: 'heic', mime: 'image/heic' };
  }
  const kind = sniff(bytes);
  if (!kind) return { ok: false, reason: 'wrong_type' };
  const mime = MIME_BY_KIND[kind];
  if (!ALLOWED_EXT[mime].includes(extOf(file.name))) return { ok: false, reason: 'bad_extension' };
  const limit = kind === 'pdf' ? SLOT_LIMITS.pdf : SLOT_LIMITS.image;
  if (bytes.length > limit) return { ok: false, reason: 'too_large' };
  if (kind === 'pdf' && !pdfIsSafe(bytes)) return { ok: false, reason: 'unsafe_pdf' };
  return { ok: true, kind, mime };
}

async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {}
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

const toBlob = (canvas, mime, quality) => new Promise((resolve) => canvas.toBlob(resolve, mime, quality));

export async function stripAndCompress(file, mime, { maxDim = 2000, quality = 0.85 } = {}) {
  const bitmap = await loadBitmap(file);
  const w = bitmap.width || bitmap.naturalWidth;
  const h = bitmap.height || bitmap.naturalHeight;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (typeof bitmap.close === 'function') bitmap.close();

  let blob = await toBlob(canvas, mime, quality);
  let outMime = mime;
  let name = file.name.replace(/\.(heic|heif)$/i, '.jpg');
  if (!blob || blob.type !== mime) {
    blob = await toBlob(canvas, 'image/jpeg', quality);
    outMime = 'image/jpeg';
    name = name.replace(/\.[^.]+$/, '') + '.jpg';
  }
  if (!blob) throw new Error('encode_failed');
  return new File([blob], name, { type: outMime });
}

export async function prepareFile(file) {
  const check = await inspectFile(file);
  if (!check.ok) return { ok: false, reason: check.reason, message: FILE_ERRORS[check.reason] };
  if (check.kind === 'pdf') {
    return { ok: true, file: new File([file], file.name, { type: check.mime }) };
  }
  const mime = check.kind === 'heic' ? 'image/jpeg' : check.mime;
  try {
    const out = await stripAndCompress(file, mime);
    if (out.size > SLOT_LIMITS.image) return { ok: false, reason: 'too_large', message: FILE_ERRORS.too_large };
    return { ok: true, file: out };
  } catch {
    const reason = check.kind === 'heic' ? 'heic_unsupported' : 'unreadable';
    return { ok: false, reason, message: FILE_ERRORS[reason] };
  }
}
