// Cloudinary's free plan refuses uploads over 10 MB, and a 12 MB phone original takes a long time on mobile data anyway.
// A photo bigger than the limit is redrawn once in the browser (longest side 4096 px, WebP 0.9) before it is sent.
// Cloudinary still scales the result to the 4K master, so nothing the seller sees changes; smaller photos are sent untouched.

export const UPLOAD_LIMIT_BYTES = 9 * 1024 * 1024;
export const SHRINK_EDGE = 4096;

export const shrinkSize = (width, height, edge = SHRINK_EDGE) => {
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
};

export async function shrinkIfHuge(file, { limit = UPLOAD_LIMIT_BYTES, draw } = {}) {
  if (!file || file.size <= limit) return file;
  try {
    const render = draw ?? defaultDraw;
    const blob = await render(file);
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file; // Cloudinary will answer "too large" and the seller sees that message
  }
}

async function defaultDraw(file) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = shrinkSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
}
