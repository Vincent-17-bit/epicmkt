import { outputSize, sourceProblem } from "./imageCrop.js";

// Browser side of the shop photo cropper: read the picked file, then draw the chosen crop into a small, clean file.
//
// Drawing the crop through a canvas also does three useful things for free:
//   - the upload is a few hundred KB instead of a 6 MB camera original, which matters on mobile data;
//   - location and camera details inside a phone photo (EXIF) are dropped, which matters for sellers who work from home;
//   - the bytes we store are ones we encoded ourselves, never the raw file somebody picked.

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const ACCEPT = PHOTO_TYPES.join(",");
// The picked file is only ever read, never uploaded, so it can be much bigger than a normal upload. A modern phone
// camera easily makes 12 MB originals.
export const MAX_PICK_BYTES = 30 * 1024 * 1024;

const fail = (code) => Object.assign(new Error(code), { code });

// True on phones and tablets, where the Camera choice opens the camera app. A desktop browser ignores the capture hint and
// would just open the file picker a second time, so the sheet hides Camera there.
export const hasTouchCamera = () => {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches) return true;
  return (navigator?.maxTouchPoints ?? 0) > 0;
};

const decode = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(fail("unreadable"));
    img.src = url;
  });

// Reads a picked file. Resolves { img, url, width, height }; the caller owns `url` and must revoke it with releasePhoto.
// Browsers apply the photo's rotation flag themselves when they decode it, so a portrait phone shot is the right way up.
export async function loadPhoto(file, spec) {
  if (!file || !PHOTO_TYPES.includes(file.type)) throw fail("unsupported_type");
  if (file.size > MAX_PICK_BYTES) throw fail("photo_too_large");
  const url = URL.createObjectURL(file);
  try {
    const img = await decode(url);
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    if (!width || !height) throw fail("unreadable");
    const problem = sourceProblem({ w: width, h: height }, spec);
    if (problem) throw fail(problem);
    return { img, url, width, height };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

export const releasePhoto = (photo) => {
  if (photo?.url) URL.revokeObjectURL(photo.url);
};

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

// Draws the source rectangle into a canvas of the final size and encodes it. WebP when the browser can write it, JPEG when
// it cannot (Safari fell back to PNG for years, which would be a huge file, so the type is checked on the way out).
// The backdrop is filled white first, so a transparent PNG logo never turns black in a JPEG.
export async function renderCrop(img, rect, spec) {
  const { w, h } = outputSize(rect, spec);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw fail("unreadable");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, w, h);
  const webp = await toBlob(canvas, "image/webp", 0.86);
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await toBlob(canvas, "image/jpeg", 0.9);
  if (!jpeg) throw fail("unreadable");
  return jpeg;
}
