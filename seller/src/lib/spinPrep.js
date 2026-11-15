// Preparing the frames of a photo spin (B14): the order they go in, whether the set is usable, and a smaller copy to send.
import { MEDIA3D } from "@epicmkt/shared";
import { shrinkSize } from "./prepareUpload.js";

export const SPIN = Object.freeze({ min: MEDIA3D.spinMinFrames, max: MEDIA3D.spinMaxFrames });
export const FRAME_EDGE = 1600;
export const FRAME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** File names in the order a camera numbers them: IMG_2 before IMG_10. */
export const sortFrames = (files) => [...files].sort((a, b) => collator.compare(a.name, b.name));

/** A frame is kept only if it is a picture type we accept and not absurdly large. */
export const acceptFrame = (file) => (!FRAME_TYPES.includes(file?.type) ? "type" : file.size > MEDIA3D.imageMaxBytes * 3 ? "big" : null);

/** What is wrong with a set of frames, as codes: too_few, too_many. Empty when the spin can be built. */
export const frameIssues = (count) => [...(count < SPIN.min ? ["too_few"] : []), ...(count > SPIN.max ? ["too_many"] : [])];

/** Turn the order round so frame `index` comes first (the start frame). */
export const startAt = (list, index) => (index <= 0 || index >= list.length ? [...list] : [...list.slice(index), ...list.slice(0, index)]);

export const move = (list, from, to) => {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
};

/** A frame redrawn smaller (longest side 1600 px, WebP) before upload. Anything that goes wrong sends the original. */
export async function compressFrame(file, { edge = FRAME_EDGE, quality = 0.82, draw } = {}) {
  try {
    const blob = await (draw ?? defaultDraw)(file, { edge, quality });
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" }) : file;
  } catch {
    return file;
  }
}

async function defaultDraw(file, { edge, quality }) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = shrinkSize(bitmap.width, bitmap.height, edge);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
}
