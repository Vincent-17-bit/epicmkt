// Pure helpers for an item's pictures and words, shared by the item page, the cards and the seller preview.
//
// The public item payload carries media[] = [{ id, kind: "image" | "video", url, poster?, caption?, duration? }] in the
// seller's order. Older payloads only have images[] and videos[]; normalizeMedia adapts them (photos first, then videos,
// because the old shape does not remember how the two were interleaved).

const isUrl = (value) => typeof value === "string" && value.length > 0;

const cleanEntry = (entry, kind, index) =>
  isUrl(entry?.url)
    ? {
        id: entry.id ?? `${kind}-${index}`,
        kind,
        url: entry.url,
        poster: isUrl(entry.poster) ? entry.poster : undefined,
        caption: typeof entry.caption === "string" ? entry.caption : "",
        duration: Number.isFinite(entry.duration) && entry.duration > 0 ? entry.duration : undefined
      }
    : null;

/** The item's media in the seller's order. Accepts an item, or { media, images, videos }. Never throws, never returns holes. */
export function normalizeMedia(source) {
  if (Array.isArray(source?.media)) {
    return source.media.map((entry, index) => cleanEntry(entry, entry?.kind === "video" ? "video" : "image", index)).filter(Boolean);
  }
  const photos = (Array.isArray(source?.images) ? source.images : []).map((entry, index) => cleanEntry(entry, "image", index));
  const videos = (Array.isArray(source?.videos) ? source.videos : []).map((entry, index) => cleanEntry(entry, "video", index));
  return [...photos, ...videos].filter(Boolean);
}

/** The picture a card or a share preview shows: the first PHOTO, never a video, however the seller ordered things. */
export function coverUrl(item) {
  const photo = normalizeMedia(item).find((entry) => entry.kind === "image");
  return photo?.url ?? (isUrl(item?.imageUrl) ? item.imageUrl : null);
}

const collapse = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

// A sentence ends at . ! or ? followed by a space and a capital, quote, bracket or digit-free start, or at the end.
// "approx. 5 kg" stays whole because a digit/lowercase follows the dot.
const FIRST_SENTENCE = /^(.+?[.!?])(?=\s+[A-Z"“'(]|\s*$)/;
const BLURB_MAX = 220;

/** The first sentence of a longer text, whitespace collapsed and capped. */
export function firstSentence(text, max = BLURB_MAX) {
  const flat = collapse(text);
  if (!flat) return "";
  const match = FIRST_SENTENCE.exec(flat);
  const sentence = match ? match[1] : flat;
  return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence;
}

/** The short line under a card's name: the short description, else the first sentence of the description, else nothing. */
export function cardBlurb(item) {
  return collapse(item?.shortDescription) || firstSentence(item?.description);
}

/** The text for a page's meta description: the short description, else the description, in one clipped line. */
export function metaDescription(item, max = 160) {
  const text = collapse(item?.shortDescription) || collapse(item?.description);
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The full description without the short one repeated at its start. When the two say the same thing the result is "" so
 * the page shows the words once. Paragraph breaks in what remains are kept.
 */
export function dedupeDescription(short, full) {
  const body = String(full ?? "").trim();
  const lead = collapse(short);
  if (!body) return "";
  if (!lead) return body;
  if (collapse(body).toLowerCase() === lead.toLowerCase()) return "";
  const words = lead.split(" ").map(escapeRe).join("\\s+");
  const re = new RegExp(`^${words}[\\s.:;,\\-–—]*`, "i");
  return re.test(body) ? body.replace(re, "").trim() : body;
}

/** Paragraphs of a description: blank lines separate them, single line breaks inside one are kept by the caller's CSS. */
export function paragraphs(text) {
  return String(text ?? "")
    .split(/\r?\n\s*\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** 83 -> "1:23", 3725 -> "1:02:05". Anything that is not a positive number gives "". */
export function formatDuration(seconds) {
  const total = Math.round(Number(seconds));
  if (!Number.isFinite(total) || total <= 0) return "";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
