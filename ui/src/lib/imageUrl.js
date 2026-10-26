// Smaller copies of stored pictures, so a product card never downloads the 4K master a seller uploaded.
//
// Pictures live in Cloudinary. A delivery url built by @epicmkt/shared (imageUrl) already carries f_auto (AVIF/WebP/JPEG as
// the browser prefers), a quality tier and a width; resizedUrl / srcSetFor only swap that width, so a 160 px avatar and a
// 1600 px gallery shot are the same file at two sizes, each a few KB to a few hundred KB, cached forever by Cloudinary's CDN.
//
// Pictures stored before the move still come from Supabase Storage. It can resize on the fly at /storage/v1/render/image/public/...
// but that is a paid-plan feature, so it stays off until the app turns it on with setImageTransform(true)
// (the client does this from VITE_IMAGE_TRANSFORMS). While it is off those urls are returned unchanged, which is always safe.

import { imageSrcSet, isCloudinaryDelivery, resizeImageUrl } from "@epicmkt/shared";

const OBJECT = "/storage/v1/object/public/";
const RENDER = "/storage/v1/render/image/public/";
const WIDTHS = [240, 480, 800, 1200];

let enabled = false;
export const setImageTransform = (on) => {
  enabled = Boolean(on);
};
export const imageTransformEnabled = () => enabled;

const canResize = (url) => enabled && typeof url === "string" && url.includes(OBJECT) && !url.startsWith("blob:") && !url.startsWith("data:");

export function resizedUrl(url, width) {
  if (isCloudinaryDelivery(url)) return resizeImageUrl(url, width);
  if (!canResize(url)) return url;
  const w = WIDTHS.find((x) => x >= width) ?? WIDTHS[WIDTHS.length - 1];
  return `${url.replace(OBJECT, RENDER)}${url.includes("?") ? "&" : "?"}width=${w}&quality=70&resize=cover`;
}

export function srcSetFor(url) {
  if (isCloudinaryDelivery(url)) return imageSrcSet(url);
  if (!canResize(url)) return undefined;
  return WIDTHS.map((w) => `${resizedUrl(url, w)} ${w}w`).join(", ");
}
