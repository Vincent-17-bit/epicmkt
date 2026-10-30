import { MEDIA_RULES } from "./media.js";

export const PHOTO_MIMES = ["image/jpeg", "image/png", "image/webp"];
export const VIDEO_MIMES = ["video/mp4", "video/webm"];

const cap = (v) => (Number.isInteger(Number(v)) && Number(v) >= 0 && v !== null && v !== "" ? Number(v) : null);

export const mediaLimitsOf = (raw) => ({ photos: cap(raw?.photosPerItem), videos: cap(raw?.videosPerItem) });

export function mediaUsage(list, limits) {
  const used = { photos: 0, videos: 0 };
  for (const m of list) used[m.kind === "video" ? "videos" : "photos"] += 1;
  const part = (n, max) => ({ used: n, max, left: max === null ? null : Math.max(0, max - n), full: max !== null && n >= max });
  return { photos: part(used.photos, limits?.photos ?? null), videos: part(used.videos, limits?.videos ?? null) };
}

const plural = (n, one, many) => (n === 1 ? one : many);

export function mediaSummary(usage) {
  const bit = (u, one, many) => (u.max === null ? `${u.used} ${plural(u.used, one, many)}` : `${u.used} of ${u.max} ${plural(u.max, one, many)}`);
  return `${bit(usage.photos, "photo", "photos")}, ${bit(usage.videos, "video", "videos")}`;
}

export function limitNote(usage, kind) {
  const u = usage[kind === "video" ? "videos" : "photos"];
  if (!u.full) return null;
  const word = kind === "video" ? "video" : "photo";
  return `Your plan allows ${u.max} ${plural(u.max, word, `${word}s`)} per item. Remove one to add another, or upgrade your plan.`;
}

export const canAdd = (usage, kind) => !usage[kind === "video" ? "videos" : "photos"].full;

export const coverIndex = (list) => list.findIndex((m) => m.kind !== "video");

export function coverNote(list) {
  if (!list.length || list[0].kind !== "video") return null;
  return coverIndex(list) > 0 ? "Cover will be the next photo" : "Add a photo to set the cover";
}

export function moveMedia(list, from, to) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [one] = next.splice(from, 1);
  next.splice(to, 0, one);
  return next;
}

export const mediaLabel = (kind, position) => `${kind === "video" ? "Video" : "Photo"} ${position}`;

export function moveAnnouncement(list, from, to) {
  const m = list[from];
  if (!m) return "";
  const after = moveMedia(list, from, to);
  const note = coverNote(after);
  return `${mediaLabel(m.kind, from + 1)} moved to position ${to + 1}.${note ? ` ${note}.` : ""}`;
}

const EXT = (name) => String(name ?? "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
const PHONE_VIDEO_EXT = new Set(["mov", "hevc", "m4v", "3gp", "avi", "mkv"]);
const PHONE_PHOTO_EXT = new Set(["heic", "heif"]);

export function classifyFile(file) {
  const type = String(file?.type ?? "").toLowerCase();
  const ext = EXT(file?.name);
  if (PHOTO_MIMES.includes(type)) return { kind: "image", code: null };
  if (VIDEO_MIMES.includes(type)) return { kind: "video", code: null };
  if (type === "image/heic" || type === "image/heif" || PHONE_PHOTO_EXT.has(ext)) return { kind: "image", code: "photo_heic" };
  if (type === "video/quicktime" || type === "video/hevc" || PHONE_VIDEO_EXT.has(ext)) return { kind: "video", code: "video_mov" };
  if (type.startsWith("video/")) return { kind: "video", code: "video_unsupported" };
  if (type.startsWith("image/")) return { kind: "image", code: "unsupported_type" };
  if (!type && ext === "mp4") return { kind: "video", code: null };
  if (!type && ext === "webm") return { kind: "video", code: null };
  if (!type && ["jpg", "jpeg", "png", "webp"].includes(ext)) return { kind: "image", code: null };
  return { kind: null, code: "media_unsupported" };
}

export function videoFileProblem({ size, durationSec }) {
  if (size > MEDIA_RULES.videoMaxBytes) return "video_too_large";
  if (durationSec !== undefined && durationSec !== null && durationSec > MEDIA_RULES.videoMaxSeconds) return "video_too_long";
  return null;
}

export function sizeProblem(kind, size) {
  if (kind === "video") return size > MEDIA_RULES.videoMaxBytes ? "video_too_large" : null;
  return size > MEDIA_RULES.imageMaxBytes ? "too_large" : null;
}

export const formatDuration = (sec) => {
  const total = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};
