// One place that knows how a stored picture becomes a url, and how an upload is turned into a 4K master.
// Pure and dependency free: the browser apps, the Vercel functions and the Supabase edge functions all use it
// (scripts/sync-shared.mjs copies it next to the edge functions).
//
// Two kinds of stored value live in the same database columns (item_media.path, businesses.logo_path / cover_path):
//
//   Cloudinary public id   "<businessId>/<itemId>/<uuid>"       no file extension, ever
//   Legacy Supabase path   "<businessId>/<itemId>/<uuid>.jpg"   always ends in a file extension
//
// New pictures are always Cloudinary ids. Old rows keep working from the Supabase bucket until
// scripts/migrate-images-to-cloudinary.mjs moves them. Videos stay in Supabase (they have an extension, so they are legacy-style).

/** Longest side of the stored master. Everything the seller uploads is scaled (up or down) to this. */
export const MASTER_EDGE = 3840;

/** Widths the site asks Cloudinary for. A card never downloads more than it can show. */
export const IMAGE_WIDTHS = [96, 160, 240, 320, 480, 640, 800, 1200, 1600, 2400, 3840];

/** Formats a seller may upload. Cloudinary re-encodes them; the browser is served f_auto (AVIF/WebP/JPEG). */
export const UPLOAD_FORMATS = ["jpg", "png", "webp"];

const EXTENSION = /\.[A-Za-z0-9]{2,5}$/;
const SUPABASE_OBJECT = "/storage/v1/object/public/seller-media/";

/** True for a value that is a Cloudinary public id (not a url, not a blob, no file extension). */
export const isCloudinaryId = (path) =>
  typeof path === "string" &&
  path.length > 0 &&
  path.length <= 300 &&
  !/^(blob:|data:|https?:)/i.test(path) &&
  !path.includes("..") &&
  !EXTENSION.test(path);

const clampWidth = (width) => {
  const w = Number(width);
  if (!Number.isFinite(w) || w <= 0) return IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1];
  return IMAGE_WIDTHS.find((x) => x >= w) ?? IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1];
};

// Small slots get harder compression: a 160 px avatar does not need the bytes a 1600 px hero does.
// q_auto lets Cloudinary pick the lowest quality that still looks right; the suffix shifts that choice.
const qualityFor = (width) => (width <= 480 ? "q_auto:eco" : width <= 1200 ? "q_auto:good" : "q_auto:best");

/** The transformation segment of a delivery url, e.g. "f_auto,q_auto:eco,c_limit,w_480". Always starts with f_auto. */
export const deliveryTransform = (width) => {
  const w = clampWidth(width);
  return `f_auto,${qualityFor(w)},c_limit,w_${w}`;
};

const cleanCloud = (cloudName) => String(cloudName ?? "").trim();
const CLOUD_NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/** https://res.cloudinary.com/<cloud>/image/upload/<transform>/<publicId> */
export function cloudinaryUrl(cloudName, publicId, width = 800) {
  const cloud = cleanCloud(cloudName);
  if (!CLOUD_NAME.test(cloud) || !isCloudinaryId(publicId)) return null;
  const id = publicId.split("/").map(encodeURIComponent).join("/");
  return `https://res.cloudinary.com/${cloud}/image/upload/${deliveryTransform(width)}/${id}`;
}

/**
 * The url for a stored value, whichever store holds it.
 * config: { cloudName, supabaseUrl, width }. Returns null when it cannot be built (no path, or the needed setting is missing).
 */
export function imageUrl(path, { cloudName, supabaseUrl, width = 800 } = {}) {
  if (!path) return null;
  if (/^(blob:|data:|https?:)/i.test(path)) return path;
  if (isCloudinaryId(path)) return cloudinaryUrl(cloudName, path, width);
  if (!supabaseUrl) return null;
  return `${String(supabaseUrl).replace(/\/$/, "")}${SUPABASE_OBJECT}${path}`;
}

const OURS = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)f_auto,[^/]*\/(.+)$/;

/** True for a delivery url this module built (so a width can be swapped in). */
export const isCloudinaryDelivery = (url) => typeof url === "string" && OURS.test(url);

/** The same picture at another width. Urls that are not ours come back unchanged. */
export function resizeImageUrl(url, width) {
  const m = typeof url === "string" ? OURS.exec(url) : null;
  return m ? `${m[1]}${deliveryTransform(width)}/${m[2]}` : url;
}

/** A srcset for a delivery url, or undefined when the url is not ours. */
export function imageSrcSet(url, widths = [240, 480, 800, 1200, 1600]) {
  if (!isCloudinaryDelivery(url)) return undefined;
  return widths.map((w) => `${resizeImageUrl(url, w)} ${clampWidth(w)}w`).join(", ");
}

/**
 * The transformation Cloudinary runs on the file BEFORE storing it, so the stored original is already the 4K master.
 *   1. Pictures smaller than 960 px on both sides go through Cloudinary's AI upscaler first (it multiplies each side by 4)
 *      when `aiUpscale` is on. That add-on is optional; without it the next step still reaches 4K, just without invented detail.
 *   2. c_fit scales the picture, up or down, so its longest side is exactly MASTER_EDGE. Aspect ratio is kept, nothing is cropped.
 *   3. q_auto:best keeps the master crisp while still shaving the bytes a camera original wastes.
 */
export function uploadTransformation({ aiUpscale = false } = {}) {
  const ai = aiUpscale ? "if_w_lt_960_and_h_lt_960/e_upscale/if_end/" : "";
  return `${ai}c_fit,w_${MASTER_EDGE},h_${MASTER_EDGE}/q_auto:best`;
}

/** Where a seller's uploads live in Cloudinary. The business id comes first, so ownership is checkable by prefix. */
export const itemPhotoId = (businessId, itemId, uuid) => `${businessId}/${itemId}/${uuid}`;
export const shopImageId = (businessId, kind, uuid) => `${businessId}/profile/${kind}-${uuid}`;
export const galleryImageId = (businessId, uuid) => `${businessId}/gallery/${uuid}`;
export const staffImageId = (businessId, uuid) => `${businessId}/staff/${uuid}`;

/** A public id the given business may own: its own prefix, no traversal, no extension. */
export const ownsImageId = (businessId, publicId) =>
  isCloudinaryId(publicId) && typeof businessId === "string" && publicId.startsWith(`${businessId}/`);
