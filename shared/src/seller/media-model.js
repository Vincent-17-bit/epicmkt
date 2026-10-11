// Pure rules for item photos and videos. The browser pipeline, the mock API, the manager UI and the preview all use
// these, so a limit or an ordering rule is written once. Server-side limits live in media.js and the database.

export const MEDIA_UI_RULES = {
  image: { minLongSide: 600, warnLongSide: 1000, maxBytes: 15 * 1024 * 1024 },
  video: { maxSeconds: 45, maxBytes: 25 * 1024 * 1024 },
  altMax: 120,
  posterMinSecond: 0,
  defaultPosterSecond: 1,
};

export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "heic", "heif"];
export const VIDEO_EXTENSIONS = ["mp4", "webm", "mov"];
export const MEDIA_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/webm,video/quicktime,.heic,.heif,.mov";

export const MEDIA_STATUS = ["processing", "ready", "failed"];

// ---- plan limits and counters ----

// limits: { photos, videos } where null means unlimited. Read from global_limits (photosPerItem, videosPerItem).
export function mediaLimitsFor(globalLimits, planKey) {
  const row = (planKey === "premium" ? globalLimits?.premium : globalLimits?.standard) ?? {};
  const pick = (v) => (v === null || v === undefined ? null : Number(v));
  return { photos: row.photosPerItem === undefined ? 7 : pick(row.photosPerItem), videos: row.videosPerItem === undefined ? 1 : pick(row.videosPerItem) };
}

// Same rule as the database: failed uploads and media the admin removed do not use up a slot.
export const countsAgainstLimit = (m) => m.status !== "failed" && !m.removedByAdmin;

export function mediaCounts(list) {
  const live = list.filter(countsAgainstLimit);
  return { photos: live.filter((m) => m.kind === "image").length, videos: live.filter((m) => m.kind === "video").length };
}

export function mediaCounterText(counts, limits) {
  const part = (n, limit, one, many) => (limit == null ? `${n} ${n === 1 ? one : many}` : `${n} of ${limit} ${limit === 1 ? one : many}`);
  return `${part(counts.photos, limits.photos, "photo", "photos")}, ${part(counts.videos, limits.videos, "video", "videos")}`;
}

export function mediaRoom(counts, limits) {
  const left = (n, limit) => (limit == null ? Infinity : Math.max(0, limit - n));
  return { photos: left(counts.photos, limits.photos), videos: left(counts.videos, limits.videos) };
}

export const atMediaLimit = (counts, limits, kind) => mediaRoom(counts, limits)[kind === "video" ? "videos" : "photos"] === 0;

// ---- ordering, cover, publishing ----

export const byOrder = (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || String(a.id).localeCompare(String(b.id));
export const sortMedia = (list) => [...list].sort(byOrder);

// Exactly what a shopper can see, in the order they see it. Processing, failed and admin-removed media never appear.
export const customerMedia = (list) => sortMedia(list).filter((m) => m.status === "ready" && !m.removedByAdmin);

// The card cover is the first image, even when a video comes first in the gallery.
export const coverOf = (list) => customerMedia(list).find((m) => m.kind === "image") ?? null;

// An item needs at least one ready image to be shown to shoppers. A video alone is not enough.
export const canPublish = (list) => coverOf(list) !== null;

export const PUBLISH_BLOCKED_MESSAGE = "Add at least one photo before showing this item to shoppers. A video on its own is not enough.";

// What ProductGallery takes. Images carry a srcSet when responsive variants exist; videos carry a poster and never autoplay.
export function galleryItems(list, name = "") {
  return customerMedia(list).map((m, i) => {
    const alt = (m.alt && m.alt.trim()) || suggestAlt(name, i + 1);
    if (m.kind === "video") return { id: m.id, kind: "video", url: m.url, poster: m.posterUrl ?? null, durationSec: m.durationSec ?? null, alt, caption: alt };
    return { id: m.id, kind: "image", url: m.url, srcSet: m.srcSet || undefined, sizes: m.srcSet ? "(max-width: 700px) 100vw, 700px" : undefined, alt, caption: alt };
  });
}

export function moveInList(list, from, to) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

export const withSorts = (list) => list.map((m, i) => (m.sort === i ? m : { ...m, sort: i }));

// ---- alt text ----

export function suggestAlt(name, n) {
  const base = String(name ?? "").trim() || "Item";
  const suffix = ` - view ${n}`;
  return `${base.slice(0, MEDIA_UI_RULES.altMax - suffix.length)}${suffix}`;
}
export const clampAlt = (v) => String(v ?? "").replace(/\s+/g, " ").slice(0, MEDIA_UI_RULES.altMax);
export const altProblem = (v) => (String(v ?? "").length > MEDIA_UI_RULES.altMax ? `Up to ${MEDIA_UI_RULES.altMax} characters` : "");

// ---- file classification and checks (browser, before anything is uploaded) ----

const extOf = (name) => (String(name).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "");

// By what the browser says, as a first pass only. The pipeline reads the real bytes before it trusts any of this.
export function classifyFile(file) {
  const ext = extOf(file.name);
  const type = String(file.type || "").toLowerCase();
  if (type.startsWith("image/") || IMAGE_EXTENSIONS.includes(ext)) {
    const heic = /heic|heif/.test(type) || ext === "heic" || ext === "heif";
    return { kind: "image", heic };
  }
  if (type.startsWith("video/") || VIDEO_EXTENSIONS.includes(ext)) return { kind: "video", mov: type === "video/quicktime" || ext === "mov" };
  return null;
}

export function humanSize(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

// Reject under 600px on the long side, warn under 1000px, reject over 15 MB. Returns { ok, error?, warning? }.
export function checkImage({ width, height, bytes }) {
  const rules = MEDIA_UI_RULES.image;
  if (bytes > rules.maxBytes) return { ok: false, code: "too_large", error: `This photo is ${humanSize(bytes)}. The limit is ${humanSize(rules.maxBytes)}.` };
  const long = Math.max(width, height);
  if (long < rules.minLongSide) return { ok: false, code: "too_small", error: `This photo is only ${long}px on its longest side. Use one at least ${rules.minLongSide}px.` };
  if (long < rules.warnLongSide) return { ok: true, warning: `Low resolution (${long}px). Photos at least ${rules.warnLongSide}px look sharper on large screens.` };
  return { ok: true };
}

// canPlay is the result of video.canPlayType for the file's type, "" when the browser cannot play it.
export function checkVideo({ durationSec, bytes, type, canPlay = true, hevc = false }) {
  const rules = MEDIA_UI_RULES.video;
  if (type === "mov" && !canPlay) return { ok: false, code: "mov_unplayable", error: "This browser cannot play .mov files. Export the video as MP4 (H.264) and try again." };
  if (bytes > rules.maxBytes) return { ok: false, code: "too_large", error: `This video is ${humanSize(bytes)}. The limit is ${humanSize(rules.maxBytes)}.` };
  if (!Number.isFinite(durationSec) || durationSec <= 0) return { ok: false, code: "unreadable", error: "We could not read this video. Try an MP4 (H.264) or WebM file." };
  if (durationSec > rules.maxSeconds) return { ok: false, code: "too_long", error: `This video is ${Math.round(durationSec)} seconds. The limit is ${rules.maxSeconds} seconds.` };
  if (hevc) return { ok: true, warning: "This looks like an iPhone (HEVC) video. Some shoppers' browsers cannot play it. If it does not work, export it as MP4 (H.264)." };
  return { ok: true };
}

export const formatDuration = (sec) => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// Rough bytes for a set of WebP variants before encoding, so the card can show an estimate while it works.
export function estimateVariantBytes(sourceWidth, sourceHeight, widths) {
  const ratio = sourceHeight / Math.max(1, sourceWidth);
  return Math.round(widths.reduce((sum, w) => sum + w * (w * ratio) * 0.1, 0));
}

// ---- messages for server answers ----

const SERVER_MESSAGES = {
  limit_reached: "Your plan's limit for this item is full. Remove one or upgrade to add more.",
  unsupported_type: "That file is not a photo or video we can use. Use JPG, PNG, WebP, MP4 or WebM.",
  too_large: "That file is too large.",
  too_small: "That photo is too small. Use one at least 600px on its longest side.",
  too_long: `That video is longer than ${MEDIA_UI_RULES.video.maxSeconds} seconds.`,
  too_big_dimensions: "That file's dimensions are too large.",
  unreadable: "We could not read that file. Try another one.",
  unsupported_codec: "This video uses a format most browsers cannot play (HEVC). Export it as MP4 (H.264) and try again.",
  item_not_found: "Save the item first, then add photos.",
  forbidden: "You can only add media to your own items.",
  rate_limited: "Too many uploads. Wait a moment and try again.",
  cancelled: "Upload cancelled.",
  not_allowed: "You cannot change this media.",
  removed_by_admin: "This media was removed by an admin and cannot be changed.",
  alt_too_long: `Alt text can be up to ${MEDIA_UI_RULES.altMax} characters.`,
  variant_not_found: "That variant no longer exists on this item.",
};
export const mediaErrorMessage = (code, fallback = "Something went wrong. Check your connection and try again.") => SERVER_MESSAGES[code] ?? fallback;
