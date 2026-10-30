// Geometry for the shop photo cropper. Pure functions, no DOM, so every rule can be tested in Node.
//
// Why a cropper at all: one cover photo is shown in several shapes (the shop page banner, a 2:1 shop card, square
// thumbnails). A raw upload would be stretched, letterboxed or cut at random. So the seller frames the picture once,
// at a fixed ratio, and we store only that framed crop. Every screen then shows the same picture with object-fit: cover.
//
// The model is "what is under the middle of the frame": the image point (cx, cy), in source pixels, plus a zoom of
// 1 or more. Zoom 1 means the picture just covers the frame, so there is never an empty strip and never any
// stretching. Because the state is stored in source pixels, it survives the frame being resized (rotating a phone).

export const MAX_ZOOM = 4;

export const SHOP_IMAGES = {
  logo: {
    kind: "logo",
    title: "Shop logo",
    ratio: 1,
    out: { w: 512, h: 512 },
    minSource: { w: 200, h: 200 },
    capture: "environment",
    round: true,
    tooSmall: "logo_too_small",
  },
  cover: {
    kind: "cover",
    title: "Cover photo",
    ratio: 3,
    out: { w: 1500, h: 500 },
    minSource: { w: 600, h: 200 },
    capture: "environment",
    round: false,
    // Shop cards show the cover at 2:1 and thumbnails at 1:1. These are the parts of the 3:1 crop that always survive.
    safe: { card: 2, square: 1 },
    tooSmall: "cover_too_small",
  },
};

export const ITEM_PHOTO_SPEC = {
  kind: "item",
  noun: "photo",
  title: "Item photo",
  ratio: 4 / 3,
  out: { w: 1600, h: 1200 },
  minSource: { w: 267, h: 200 },
  round: false,
  tooSmall: "too_small",
};

export const SHOP_IMAGE_KINDS = Object.keys(SHOP_IMAGES);

const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));

// The scale at which the picture exactly covers the frame (zoom 1).
export const baseScale = (img, frame) => Math.max(frame.w / img.w, frame.h / img.h);

// Everything the screen and the canvas need for one state, with the centre clamped so the frame never leaves the picture.
export function viewFor({ img, frame, zoom, cx, cy }) {
  const z = clamp(zoom, 1, MAX_ZOOM);
  const scale = baseScale(img, frame) * z;
  const sw = frame.w / scale;
  const sh = frame.h / scale;
  const x = clamp(cx, sw / 2, img.w - sw / 2);
  const y = clamp(cy, sh / 2, img.h - sh / 2);
  return {
    zoom: z,
    scale,
    cx: x,
    cy: y,
    sx: x - sw / 2,
    sy: y - sh / 2,
    sw,
    sh,
    // Where to draw the picture on screen, in frame pixels, relative to the frame centre.
    tx: -(x - img.w / 2) * scale,
    ty: -(y - img.h / 2) * scale,
  };
}

export const startState = (img) => ({ zoom: 1, cx: img.w / 2, cy: img.h / 2 });

// Drag by (dx, dy) screen pixels: the picture follows the finger, so the point under the centre moves the other way.
// The result is clamped before it is stored, so dragging past an edge does not build up a dead zone to drag back through.
export function panBy(state, ctx, dx, dy) {
  const v = viewFor({ ...ctx, ...state });
  const next = viewFor({ ...ctx, zoom: v.zoom, cx: v.cx - dx / v.scale, cy: v.cy - dy / v.scale });
  return { zoom: next.zoom, cx: next.cx, cy: next.cy };
}

// Zoom while keeping the point under `focus` (frame pixels from the frame centre) where it is, like pinch and wheel do.
export function zoomAbout(state, ctx, nextZoom, focus = { x: 0, y: 0 }) {
  const v = viewFor({ ...ctx, ...state });
  const z = clamp(nextZoom, 1, MAX_ZOOM);
  const nextScale = baseScale(ctx.img, ctx.frame) * z;
  const px = v.cx + focus.x / v.scale; // the source pixel under the focus right now
  const py = v.cy + focus.y / v.scale;
  const next = viewFor({ ...ctx, zoom: z, cx: px - focus.x / nextScale, cy: py - focus.y / nextScale });
  return { zoom: next.zoom, cx: next.cx, cy: next.cy };
}

// The source rectangle to draw into the output canvas.
export const cropRect = (state, ctx) => {
  const v = viewFor({ ...ctx, ...state });
  return { sx: v.sx, sy: v.sy, sw: v.sw, sh: v.sh };
};

// Output size: the target size, but never bigger than the pixels we actually have. Upscaling only makes a bigger, blurrier file.
export function outputSize(rect, spec) {
  const f = Math.min(1, rect.sw / spec.out.w, rect.sh / spec.out.h);
  return { w: Math.max(1, Math.round(spec.out.w * f)), h: Math.max(1, Math.round(spec.out.h * f)) };
}

// Null when the photo is big enough to give a sharp result, otherwise the error code to show.
export const sourceProblem = (img, spec) => (img.w < spec.minSource.w || img.h < spec.minSource.h ? spec.tooSmall : null);

// Share of the frame width that the always-visible zones take, for the guide drawn over a cover crop.
export const safeShare = (spec, name) => (spec.safe?.[name] ? Math.min(1, spec.safe[name] / spec.ratio) : null);
