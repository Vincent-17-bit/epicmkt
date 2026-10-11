import { sniffMedia, variantWidthsFor, videoCodec, checkImage, checkVideo, MEDIA_UI_RULES, humanSize, estimateVariantBytes, mediaObjectPath } from "@epicmkt/shared";
import { ApiError } from "../api/errors.js";
import { getMediaEngine } from "./engine.js";
import { bytesOf, concatBytes, headBytes } from "./bytes.js";

// Everything that happens in the browser before a byte is uploaded. It reads the real bytes (never the file name),
// checks the rules, and produces the files to upload. The server checks all of it again.

const cancelled = () => new ApiError("cancelled", "Upload cancelled.");
const guard = (signal) => { if (signal?.aborted) throw cancelled(); };

const HEIC_HELP = "This browser cannot open HEIC photos. On an iPhone, set Camera > Formats to Most Compatible, or export the photo as JPG, then add it again.";

export async function prepareImage(file, { engine = getMediaEngine(), signal, onProgress = () => {}, sniff } = {}) {
  guard(signal);
  const kind = sniff ?? sniffMedia(await headBytes(file, 64));
  if (!kind) throw new ApiError("unsupported_type", "That file is not a photo or video we can use. Use JPG, PNG, WebP, HEIC, MP4 or WebM.");
  const heic = kind.accepted === false;
  if (file.size > MEDIA_UI_RULES.image.maxBytes) {
    const check = checkImage({ width: 9999, height: 9999, bytes: file.size });
    throw new ApiError(check.code, check.error);
  }

  let decoded;
  try {
    decoded = await engine.decodeImage(file);
  } catch {
    throw new ApiError(heic ? "heic_unsupported" : "unreadable", heic ? HEIC_HELP : "We could not read that photo. Try another file.");
  }
  try {
    guard(signal);
    const check = checkImage({ width: decoded.width, height: decoded.height, bytes: file.size });
    if (!check.ok) throw new ApiError(check.code, check.error);

    const widths = variantWidthsFor(decoded.width);
    const variants = [];
    for (const [i, width] of widths.entries()) {
      guard(signal);
      variants.push(await engine.encode(decoded, { width }));
      onProgress((i + 1) / (widths.length + 1));
    }
    guard(signal);
    const placeholder = await engine.placeholder(decoded);
    onProgress(1);

    const standard = variants.filter((v) => v.width <= 1600);
    const main = standard[standard.length - 1] ?? variants[variants.length - 1];
    const total = variants.reduce((n, v) => n + v.blob.size, 0);
    return {
      kind: "image",
      name: file.name,
      original: { width: decoded.width, height: decoded.height, bytes: file.size, heic },
      variants,
      main,
      placeholder,
      warning: check.warning ?? null,
      totalBytes: total,
      estimateBytes: estimateVariantBytes(decoded.width, decoded.height, widths),
      summary: `${variants.length} sizes, ${humanSize(total)} in all (from ${humanSize(file.size)})`,
    };
  } finally {
    decoded.close?.();
  }
}

// Reads the start and end of a video, where its sample description lives, to tell iPhone HEVC from H.264.
const codecOf = async (file, type) => {
  const slice = 1_500_000;
  const parts = [await bytesOf(file.slice(0, slice))];
  if (file.size > slice) parts.push(await bytesOf(file.slice(Math.max(slice, file.size - slice))));
  return videoCodec(concatBytes(...parts), type);
};

const HEVC_HELP = "This looks like an iPhone (HEVC) video that this browser cannot read. Export it as MP4 (H.264) and try again.";

export async function prepareVideo(file, { engine = getMediaEngine(), signal, onProgress = () => {}, sniff } = {}) {
  guard(signal);
  const kind = sniff ?? sniffMedia(await headBytes(file, 64));
  if (!kind || !["mp4", "mov", "webm"].includes(kind.type)) throw new ApiError("unsupported_type", "That video is not an MP4 or WebM file. QuickTime (.mov) works only if your browser can play it.");
  if (file.size > MEDIA_UI_RULES.video.maxBytes) {
    const check = checkVideo({ durationSec: 1, bytes: file.size, type: kind.type });
    throw new ApiError(check.code, check.error);
  }
  const canPlay = kind.type === "mov" ? Boolean(engine.canPlayType("video/quicktime")) : true;
  if (kind.type === "mov" && !canPlay) {
    const check = checkVideo({ durationSec: 1, bytes: file.size, type: "mov", canPlay: false });
    throw new ApiError(check.code, check.error);
  }
  const codec = await codecOf(file, kind.type);

  let probe;
  try {
    probe = await engine.probeVideo(file);
  } catch {
    throw new ApiError(codec === "hevc" ? "unsupported_codec" : "unreadable", codec === "hevc" ? HEVC_HELP : "We could not read that video. Try an MP4 (H.264) or WebM file.");
  }
  try {
    guard(signal);
    onProgress(0.4);
    const check = checkVideo({ durationSec: probe.duration, bytes: file.size, type: kind.type, canPlay, hevc: codec === "hevc" });
    if (!check.ok) throw new ApiError(check.code, check.error);

    let poster = null;
    let warning = check.warning ?? null;
    try {
      poster = await engine.captureFrame(probe, Math.min(MEDIA_UI_RULES.defaultPosterSecond, probe.duration / 2));
    } catch {
      warning = [warning, "We could not capture a poster picture. Open the video and choose one, or upload your own."].filter(Boolean).join(" ");
    }
    onProgress(1);
    return {
      kind: "video",
      name: file.name,
      file,
      type: kind.type,
      mime: kind.mime,
      codec,
      duration: probe.duration,
      width: probe.width,
      height: probe.height,
      poster,
      warning,
      totalBytes: file.size + (poster?.blob.size ?? 0),
      summary: `${humanSize(file.size)}, ${Math.round(probe.duration)} seconds`,
    };
  } finally {
    probe.dispose?.();
  }
}

// Decides by the real bytes, not the name or the type the browser reports.
export async function prepareMedia(file, opts = {}) {
  const sniff = sniffMedia(await headBytes(file, 64));
  if (!sniff) throw new ApiError("unsupported_type", "That file is not a photo or video we can use. Use JPG, PNG, WebP, HEIC, MP4 or WebM.");
  return sniff.kind === "video" ? prepareVideo(file, { ...opts, sniff }) : prepareImage(file, { ...opts, sniff });
}

// ---- what to upload and where ----

const token = () => Math.random().toString(36).slice(2, 8);

// Every object of one media goes in <business>/<item>/<media>/. File names carry a short token so a replacement can sit
// in the same folder beside the media it replaces, and so cached copies are never confused with new ones.
export function uploadPlan(prepared, ids) {
  const tag = token();
  const at = (file) => mediaObjectPath(ids, file);
  if (prepared.kind === "image") {
    const objects = prepared.variants.map((v) => ({ path: at(`w${v.width}-${tag}.${v.ext}`), blob: v.blob, mime: v.type, width: v.width }));
    const mainPath = objects.find((o) => o.width === prepared.main.width).path;
    return {
      objects,
      body: {
        path: mainPath,
        variants: Object.fromEntries(objects.map((o) => [String(o.width), o.path])),
        placeholder: prepared.placeholder,
      },
    };
  }
  const ext = prepared.type === "webm" ? "webm" : prepared.type === "mov" ? "mov" : "mp4";
  const videoPath = at(`video-${tag}.${ext}`);
  const objects = [{ path: videoPath, blob: prepared.file, mime: prepared.mime, role: "video" }];
  const body = { path: videoPath };
  if (prepared.poster) {
    const posterPath = at(`poster-${tag}.${prepared.poster.ext}`);
    objects.push({ path: posterPath, blob: prepared.poster.blob, mime: prepared.poster.type, role: "poster" });
    body.poster = posterPath;
    body.posterTimeSec = Math.round(prepared.poster.timeSec * 100) / 100;
  }
  return { objects, body };
}

// A poster for an existing video, from a still frame or from a file the seller chose.
export async function preparePoster(input, { engine = getMediaEngine(), videoUrl } = {}) {
  if (input?.file) {
    const prepared = await prepareImage(input.file, { engine });
    const best = prepared.variants.find((v) => v.width >= 960) ?? prepared.main;
    return { blob: best.blob, type: best.type, ext: best.ext, width: best.width, height: best.height, timeSec: null };
  }
  const frame = await engine.captureFrame({ url: videoUrl }, Number(input?.timeSec ?? MEDIA_UI_RULES.defaultPosterSecond));
  return frame;
}

export const posterObjectPath = (ids, ext) => mediaObjectPath(ids, `poster-${token()}.${ext}`);
