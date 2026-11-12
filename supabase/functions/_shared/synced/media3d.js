// A17: 3D data, media roles and signed upload tickets. Pure functions, no imports, so the file is copied as-is to the edge functions
// (scripts/sync-shared.mjs) and the SQL in migration 0101 mirrors the rules below (db tests run both on the same cases).
//
// A media row has a `role` (image, video, spin-frame, model-glb, poster) and `optionIds` (the option VALUE ids it belongs to, plain ids,
// no foreign key). Photos and videos may belong to several values; a 3D asset belongs to the item (no ids) or to exactly one value.
// Item `view3d` = { model?: {url, size}, spin?: {frames[], count}, poster }.

export const MEDIA3D = Object.freeze({
  modelMaxBytes: 15 * 1024 * 1024,
  imageMaxBytes: 10 * 1024 * 1024,   // same as MEDIA_RULES.imageMaxBytes ("images and video as today")
  videoMaxBytes: 25 * 1024 * 1024,   // same as MEDIA_RULES.videoMaxBytes
  spinMinFrames: 12,
  spinMaxFrames: 72,
  maxRowsPerItem: 500,               // all 3D rows of one item (frames, models, posters), whatever the scope
  maxPendingTickets: 160,            // tickets handed out for one item and not finished yet (two full spins plus posters and models)
  maxOptionIds: 40,                  // a photo or video can sit under at most one axis worth of values
});

export const MEDIA_ROLES = Object.freeze(["image", "video", "spin-frame", "model-glb", "poster"]);
export const MEDIA3D_ROLES = Object.freeze(["spin-frame", "model-glb", "poster"]);
// item_media.kind for each role. The 3D kinds are new, so every existing query that filters on kind image|video is unaffected.
export const KIND_OF_ROLE = Object.freeze({ image: "image", video: "video", "spin-frame": "spin", "model-glb": "model", poster: "poster" });
export const ROLE_OF_KIND = Object.freeze(Object.fromEntries(Object.entries(KIND_OF_ROLE).map(([role, kind]) => [kind, role])));

export const GLB_MIME = "model/gltf-binary";
const PICTURE_TYPES = ["jpg", "png", "webp"];

// What seller_media_upload_ticket(kind) will sign. `storage` files go to the Supabase bucket (like videos), pictures to Cloudinary.
export const TICKET_KINDS = Object.freeze({
  image: { role: "image", purpose: "item_photo", types: PICTURE_TYPES, maxBytes: MEDIA3D.imageMaxBytes, storage: false, delegated: true },
  video: { role: "video", purpose: "item_video", types: ["mp4", "webm"], maxBytes: MEDIA3D.videoMaxBytes, storage: true, delegated: true },
  "model-glb": { role: "model-glb", purpose: "item_model", types: ["glb"], maxBytes: MEDIA3D.modelMaxBytes, storage: true, delegated: false },
  "spin-frame": { role: "spin-frame", purpose: "item_spin", types: PICTURE_TYPES, maxBytes: MEDIA3D.imageMaxBytes, storage: false, delegated: false, maxCount: MEDIA3D.spinMaxFrames },
  poster: { role: "poster", purpose: "item_poster", types: PICTURE_TYPES, maxBytes: MEDIA3D.imageMaxBytes, storage: false, delegated: false },
});

const TYPE_ALIASES = { jpeg: "jpg", "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm", [GLB_MIME]: "glb" };

// "JPEG", ".jpg", "image/jpeg" -> "jpg". Anything else (including application/octet-stream, which says nothing) -> null.
export function normalizeType(type) {
  if (typeof type !== "string") return null;
  const t = type.trim().toLowerCase().replace(/^\./, "");
  const mapped = TYPE_ALIASES[t] ?? t;
  return /^[a-z0-9]{2,5}$/.test(mapped) ? mapped : null;
}

// Server-side check of a ticket request. Pictures and the model must declare their size so a too-large file is refused BEFORE the upload;
// delegated kinds (image, video: signed by seller-media-sign as before) may omit it.
export function checkTicketRequest({ kind, type, size } = {}) {
  const rule = Object.hasOwn(TICKET_KINDS, kind) ? TICKET_KINDS[kind] : null;
  if (!rule) return { ok: false, error: "unsupported_kind" };
  const t = normalizeType(type);
  if (!t || !rule.types.includes(t)) return { ok: false, error: "unsupported_type" };
  if (size === undefined || size === null) {
    if (!rule.delegated) return { ok: false, error: "bad_size" };
  } else if (!Number.isInteger(size) || size <= 0) return { ok: false, error: "bad_size" };
  else if (size > rule.maxBytes) return { ok: false, error: "too_large", maxBytes: rule.maxBytes };
  return { ok: true, rule, type: t };
}

const VALUE_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;

// Option value ids for a media row. 3D assets: none (the item) or exactly one. Photos and videos: any number, no duplicates.
export function checkOptionIds(role, ids) {
  if (ids === undefined || ids === null) return { ok: true, ids: [] };
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string" || !VALUE_ID.test(x)) || new Set(ids).size !== ids.length) return { ok: false, error: "bad_option_ids" };
  if (!MEDIA_ROLES.includes(role)) return { ok: false, error: "unsupported_kind" };
  if (MEDIA3D_ROLES.includes(role) ? ids.length > 1 : ids.length > MEDIA3D.maxOptionIds) return { ok: false, error: MEDIA3D_ROLES.includes(role) ? "one_option_only" : "bad_option_ids" };
  return { ok: true, ids: [...ids] };
}

const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const GLB_MAGIC = 0x46546c67;   // "glTF"
const CHUNK_JSON = 0x4e4f534a;  // "JSON"

// Checks the real bytes of an uploaded .glb (the file name and the browser's MIME type prove nothing).
// ok: { ok: true, size, mime }. Refused: reason is unsupported_type (not a glTF 2 binary), too_large, corrupt (header, length or JSON
// chunk wrong) or external_resources (a buffer or image that points at another site; a model must carry everything it needs).
export function inspectGlb(bytes, { maxBytes = MEDIA3D.modelMaxBytes } = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 20 || u32(bytes, 0) !== GLB_MAGIC || u32(bytes, 4) !== 2) return { ok: false, reason: "unsupported_type" };
  if (bytes.length > maxBytes) return { ok: false, reason: "too_large" };
  if (u32(bytes, 8) !== bytes.length) return { ok: false, reason: "corrupt" };
  const jsonLength = u32(bytes, 12);
  if (u32(bytes, 16) !== CHUNK_JSON || 20 + jsonLength > bytes.length) return { ok: false, reason: "corrupt" };
  let doc;
  try {
    doc = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(20, 20 + jsonLength)).replace(/[\s\0]+$/, ""));
  } catch {
    return { ok: false, reason: "corrupt" };
  }
  if (!doc || typeof doc !== "object" || typeof doc.asset?.version !== "string" || !doc.asset.version.startsWith("2")) return { ok: false, reason: "corrupt" };
  for (const list of [doc.buffers, doc.images]) {
    if (list === undefined) continue;
    if (!Array.isArray(list)) return { ok: false, reason: "corrupt" };
    for (const x of list) if (x && typeof x === "object" && x.uri !== undefined && !(typeof x.uri === "string" && x.uri.startsWith("data:"))) return { ok: false, reason: "external_resources" };
  }
  return { ok: true, size: bytes.length, mime: GLB_MIME };
}

const cmp = (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || String(a.id ?? "").localeCompare(String(b.id ?? ""));

// rows: [{ id?, role, path, size?, sort?, createdAt?, optionIds? }]. Only the 3D roles count. Scope "" = the whole item, otherwise the option value id.
function scopes(rows) {
  const map = new Map();
  for (const r of [...(rows ?? [])].filter((x) => x && MEDIA3D_ROLES.includes(x.role)).sort(cmp)) {
    const scope = r.optionIds?.[0] ?? "";
    const s = map.get(scope) ?? { model: null, frames: [], poster: null };
    if (r.role === "model-glb") s.model ??= r;
    else if (r.role === "spin-frame") s.frames.push(r);
    else s.poster ??= r;
    map.set(scope, s);
  }
  return map;
}

const spinOk = (s) => s.frames.length >= MEDIA3D.spinMinFrames && s.frames.length <= MEDIA3D.spinMaxFrames;

// The views a buyer may see. A scope shows only with a poster AND (a model, or a spin of 12 to 72 frames); a spin outside those
// limits is left out while a valid model in the same scope still shows. Paths, not URLs: see resolveView3d.
// -> { view3d: {model?:{path,size}, spin?:{frames:[path], count}, poster:path} | null, view3dByOption: { [valueId]: same } }
export function buildView3d(rows) {
  const out = { view3d: null, view3dByOption: {} };
  for (const [scope, s] of scopes(rows)) {
    if (!s.poster || (!s.model && !spinOk(s))) continue;
    const view = {};
    if (s.model) view.model = { path: s.model.path, size: s.model.size ?? null };
    if (spinOk(s)) view.spin = { frames: s.frames.map((f) => f.path), count: s.frames.length };
    view.poster = s.poster.path;
    if (scope === "") out.view3d = view;
    else out.view3dByOption[scope] = view;
  }
  return out;
}

export const hasView3d = (rows) => { const v = buildView3d(rows); return v.view3d !== null || Object.keys(v.view3dByOption).length > 0; };

// What the seller still has to fix. scope: null = the whole item, else the option value id.
export function view3dIssues(rows) {
  const issues = [];
  for (const [scope, s] of scopes(rows)) {
    const at = scope === "" ? null : scope;
    if ((s.model || s.frames.length > 0) && !s.poster) issues.push({ code: "view3d_missing_poster", scope: at });
    if (s.frames.length > 0 && s.frames.length < MEDIA3D.spinMinFrames) issues.push({ code: "spin_too_few_frames", scope: at });
    if (s.frames.length > MEDIA3D.spinMaxFrames) issues.push({ code: "spin_too_many_frames", scope: at });
  }
  return issues.sort((a, b) => String(a.scope).localeCompare(String(b.scope)) || a.code.localeCompare(b.code));
}

// Turns the paths of buildView3d / public_item_media3d into the Contract v1 shape (urls). urlFor(path, role) is the caller's own
// (Cloudinary for pictures, the Supabase bucket for the model), so this file needs no configuration.
export function resolveView3d(raw, urlFor) {
  if (!raw || typeof raw !== "object" || !raw.poster) return null;
  const out = {};
  if (raw.model) out.model = { url: urlFor(raw.model.path, "model-glb"), size: raw.model.size };
  if (raw.spin) out.spin = { frames: raw.spin.frames.map((p) => urlFor(p, "spin-frame")), count: raw.spin.count };
  out.poster = urlFor(raw.poster, "poster");
  return out;
}

export function resolveMedia3d(payload, urlFor) {
  const by = {};
  for (const [id, raw] of Object.entries(payload?.view3dByOption ?? {})) { const v = resolveView3d(raw, urlFor); if (v) by[id] = v; }
  return { view3d: resolveView3d(payload?.view3d, urlFor), view3dByOption: by };
}
