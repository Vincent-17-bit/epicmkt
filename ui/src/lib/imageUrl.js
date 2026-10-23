// Smaller copies of stored pictures, so a product card never downloads the 10 MB original a seller uploaded.
//
// Supabase Storage can resize on the fly at /storage/v1/render/image/public/... but that is a paid-plan feature, so it
// stays off until the app turns it on with setImageTransform(true) (the client does this from VITE_IMAGE_TRANSFORMS).
// While it is off every function returns the url unchanged, which is always safe.

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
  if (!canResize(url)) return url;
  const w = WIDTHS.find((x) => x >= width) ?? WIDTHS[WIDTHS.length - 1];
  return `${url.replace(OBJECT, RENDER)}${url.includes("?") ? "&" : "?"}width=${w}&quality=70&resize=cover`;
}

export function srcSetFor(url) {
  if (!canResize(url)) return undefined;
  return WIDTHS.map((w) => `${resizedUrl(url, w)} ${w}w`).join(", ");
}
