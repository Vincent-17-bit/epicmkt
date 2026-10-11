import { newId, inspectMedia, inspectVariant, parseMediaPath, mediaLimitsFor, mediaCounts, customerMedia, MEDIA_UI_RULES } from "@epicmkt/shared";
import { ApiError } from "../api/errors.js";
import { bytesOf } from "./bytes.js";
import { normalizeRow } from "./normalize.js";
import { prepareMedia, uploadPlan, preparePoster, posterObjectPath } from "./prepare.js";

// The mock plays the server: same real byte checks, same limits, same replace/copy/remove rules as the edge functions.
// Rows use the database's column names so normalizeRow serves both.

export const MOCK_BUSINESS = "10000000-0000-4000-8000-0000000000a1";
const GLOBAL = { standard: { photosPerItem: 7, videosPerItem: 1 }, premium: { photosPerItem: 15, videosPerItem: 3 } };

const state = { rows: [], files: new Map(), blobs: new Map(), urls: new Map(), plan: "standard", failNext: null, seq: 0 };

export const resetMedia = () => {
  for (const u of state.urls.values()) if (u.startsWith("blob:")) URL.revokeObjectURL?.(u);
  Object.assign(state, { rows: [], files: new Map(), blobs: new Map(), urls: new Map(), plan: "standard", failNext: null, seq: 0 });
};
export const setMockMediaPlan = (plan) => { state.plan = plan; };
export const mockMediaLimits = () => mediaLimitsFor(GLOBAL, state.plan);
export const mockMediaRows = (itemId) => state.rows.filter((r) => !itemId || r.item_id === itemId).map((r) => ({ ...r, variants: { ...r.variants } }));
export const mockMediaFiles = () => new Map(state.files);
export const mockFailNextFinalize = (code) => { state.failNext = code; };
export const mockAdminRemoveMedia = (id, reason = "Not allowed") => {
  const row = state.rows.find((r) => r.id === id);
  if (!row) throw new ApiError("media_not_found");
  row.removed_by_admin = true;
  row.admin_remove_reason = reason;
};

const urlFor = (path) => {
  if (state.urls.has(path)) return state.urls.get(path);
  const blob = state.blobs.get(path);
  const url = blob && typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(blob) : `mock://seller-media/${path}`;
  state.urls.set(path, url);
  return url;
};
const view = (row) => normalizeRow(row, urlFor);
const folderOf = (r) => `${MOCK_BUSINESS}/${r.item_id}/${r.id}/`;
const pathsOf = (r) => [...new Set([r.path, r.poster_path, ...Object.values(r.variants ?? {})].filter(Boolean))];
const dropFiles = (paths) => {
  for (const p of paths) {
    state.files.delete(p);
    state.blobs.delete(p);
    const u = state.urls.get(p);
    if (u?.startsWith("blob:")) URL.revokeObjectURL?.(u);
    state.urls.delete(p);
  }
};
const store = async (path, blob) => { state.files.set(path, await bytesOf(blob)); state.blobs.set(path, blob); };

const counted = (r) => r.status !== "failed" && !r.removed_by_admin;
const countOf = (itemId, kind, except) => state.rows.filter((r) => r.item_id === itemId && r.kind === kind && counted(r) && r.id !== except).length;
const limitFor = (kind) => (kind === "video" ? mockMediaLimits().videos : mockMediaLimits().photos);
const atLimit = (itemId, kind, except) => { const l = limitFor(kind); return l != null && countOf(itemId, kind, except) >= l; };

const tick = (ms = 0, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(new ApiError("cancelled", "Upload cancelled."));
  const t = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); reject(new ApiError("cancelled", "Upload cancelled.")); }, { once: true });
});

export const hasReadyImage = (itemId) => state.rows.some((r) => r.item_id === itemId && r.kind === "image" && r.status === "ready" && !r.removed_by_admin);

export const listMediaRows = (itemId) => state.rows.filter((r) => r.item_id === itemId).sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id)).map(view);

// ---- upload: prepare in the browser, "upload", then the same checks finalize makes ----
export async function uploadMediaMock(item, file, onProgress = () => {}, opts = {}, latency = 0) {
  const { signal, mediaId = newId(), replaceMediaId, alt, variantId, prepared: given } = opts;
  const itemId = item.id;
  const prepared = given ?? await prepareMedia(file, { signal, onProgress: (f) => onProgress(f * 0.3, "processing") });
  const ids = { businessId: MOCK_BUSINESS, itemId, mediaId };
  const { objects, body } = uploadPlan(prepared, ids);
  const sent = [];
  try {
    const total = objects.reduce((n, o) => n + o.blob.size, 0) || 1;
    let done = 0;
    for (const o of objects) {
      await tick(latency, signal);
      await store(o.path, o.blob);
      sent.push(o.path);
      done += o.blob.size;
      onProgress(0.3 + 0.6 * (done / total), "uploading");
    }
    await tick(latency, signal);
    onProgress(0.92, "finishing");
    const row = await finalizeMock(item, { ...body, alt, variantId, replaceMediaId }, sent);
    onProgress(1, "done");
    return view(row);
  } catch (e) {
    if (e?.code !== "already_attached") dropFiles(sent.filter((p) => !state.rows.some((r) => pathsOf(r).includes(p))));
    throw e;
  }
}

async function finalizeMock(item, input, sent) {
  if (state.failNext) { const code = state.failNext; state.failNext = null; throw new ApiError(code); }
  const itemId = item.id;
  const main = parseMediaPath(input.path, { businessId: MOCK_BUSINESS, itemId });
  if (!main) throw new ApiError("forbidden");
  const extras = [...Object.values(input.variants ?? {}), ...(input.poster ? [input.poster] : [])];
  if (extras.some((p) => !parseMediaPath(p, { businessId: MOCK_BUSINESS, itemId }) || parseMediaPath(p).mediaId !== main.mediaId)) throw new ApiError("forbidden");
  const bytes = state.files.get(input.path);
  if (!bytes) throw new ApiError("file_not_found");
  const info = inspectMedia(bytes);
  if (!info.ok) throw new ApiError(info.reason);
  for (const p of extras) {
    if (p === input.path) continue;
    const b = state.files.get(p);
    const check = b ? inspectVariant(b) : { ok: false, reason: "file_not_found" };
    if (!check.ok) throw new ApiError(check.reason);
  }
  if (input.poster && info.kind !== "video") throw new ApiError("poster_only_video");
  if (input.alt && input.alt.length > MEDIA_UI_RULES.altMax) throw new ApiError("alt_too_long");
  if (input.variantId && !(item.variants ?? []).some((v) => v.id === input.variantId)) throw new ApiError("variant_not_found");

  let status = "ready";
  let failReason = null;
  if (info.kind === "video" && info.codec === "hevc") { status = "failed"; failReason = "unsupported_codec"; }
  else if (info.kind === "video" && !input.poster) status = "processing";

  let old = null;
  if (input.replaceMediaId) {
    old = state.rows.find((r) => r.id === input.replaceMediaId && r.item_id === itemId);
    if (!old) throw new ApiError("media_not_found");
    if (old.removed_by_admin) throw new ApiError("removed_by_admin");
    if (old.kind !== info.kind) throw new ApiError("kind_mismatch");
  }
  if (status !== "failed" && atLimit(itemId, info.kind, old?.id)) throw new ApiError("limit_reached");

  const row = {
    id: main.mediaId, item_id: itemId, business_id: MOCK_BUSINESS, kind: info.kind, path: input.path, mime: info.mime, status, fail_reason: failReason,
    sort: old ? old.sort : state.rows.filter((r) => r.item_id === itemId).reduce((n, r) => Math.max(n, r.sort + 1), 0),
    width: info.width, height: info.height, duration_sec: info.durationSec, size_bytes: info.size,
    variants: input.variants ?? {}, poster_path: input.poster ?? null, poster_time: input.posterTimeSec ?? null, placeholder: input.placeholder ?? null,
    alt: (input.alt ?? old?.alt ?? "").trim() || null, variant_id: input.variantId ?? old?.variant_id ?? null,
    removed_by_admin: false, admin_remove_reason: null, created_at: new Date().toISOString(),
  };
  if (!old && state.rows.some((r) => r.id === row.id)) throw new ApiError("already_attached");
  if (old) {
    state.rows = state.rows.filter((r) => r !== old);
    dropFiles(pathsOf(old).filter((p) => !pathsOf(row).includes(p)));
  }
  state.rows.push(row);
  return row;
}

export function reorderMediaMock(itemId, orderedIds) {
  const mine = state.rows.filter((r) => r.item_id === itemId);
  const have = mine.map((r) => r.id).sort();
  if (!Array.isArray(orderedIds) || orderedIds.length !== have.length || [...orderedIds].sort().some((id, i) => id !== have[i])) throw new ApiError("order_mismatch");
  orderedIds.forEach((id, i) => { state.rows.find((r) => r.id === id).sort = i; });
}

export function updateMediaMock(mediaId, patch, item) {
  const row = state.rows.find((r) => r.id === mediaId);
  if (!row) throw new ApiError("media_not_found");
  if (row.removed_by_admin) throw new ApiError("removed_by_admin");
  const bad = Object.keys(patch).find((k) => !["alt", "variantId"].includes(k));
  if (bad) throw new ApiError("field_not_allowed", `field_not_allowed:${bad}`);
  let alt = row.alt;
  let variantId = row.variant_id;
  if ("alt" in patch) {
    alt = String(patch.alt ?? "").trim() || null;
    if (alt && alt.length > MEDIA_UI_RULES.altMax) throw new ApiError("alt_too_long");
  }
  if ("variantId" in patch) {
    variantId = patch.variantId || null;
    if (variantId && !(item?.variants ?? []).some((v) => v.id === variantId)) throw new ApiError("variant_not_found");
  }
  Object.assign(row, { alt, variant_id: variantId });
  return view(row);
}

export async function setPosterMock(mediaId, input, latency = 0) {
  const row = state.rows.find((r) => r.id === mediaId);
  if (!row) throw new ApiError("media_not_found");
  if (row.kind !== "video") throw new ApiError("poster_only_video");
  if (row.removed_by_admin) throw new ApiError("removed_by_admin");
  const poster = await preparePoster(input, { videoUrl: urlFor(row.path) });
  const path = posterObjectPath({ businessId: MOCK_BUSINESS, itemId: row.item_id, mediaId }, poster.ext);
  await tick(latency);
  await store(path, poster.blob);
  const check = inspectVariant(state.files.get(path));
  if (!check.ok) { dropFiles([path]); throw new ApiError(check.reason); }
  const previous = row.poster_path;
  row.poster_path = path;
  row.poster_time = poster.timeSec ?? null;
  if (row.status === "processing") row.status = "ready";
  if (previous && previous !== path) dropFiles([previous]);
  return view(row);
}

export function removeMediaMock(mediaId) {
  const row = state.rows.find((r) => r.id === mediaId);
  if (!row) throw new ApiError("media_not_found");
  dropFiles([...pathsOf(row), ...[...state.files.keys()].filter((p) => p.startsWith(folderOf(row)))]);
  state.rows = state.rows.filter((r) => r !== row);
}

export function purgeItemMedia(itemId) {
  for (const row of state.rows.filter((r) => r.item_id === itemId)) dropFiles([...pathsOf(row), ...[...state.files.keys()].filter((p) => p.startsWith(folderOf(row)))]);
  state.rows = state.rows.filter((r) => r.item_id !== itemId);
}

// A duplicate gets its own files and rows: new ids, new paths, bytes copied. Nothing is shared with the original.
export function copyItemMediaMock(from, to) {
  if (state.rows.some((r) => r.item_id === to.id)) throw new ApiError("target_not_empty");
  const source = state.rows.filter((r) => r.item_id === from.id && counted(r)).sort((a, b) => a.sort - b.sort);
  const fromVariants = from.variants ?? [];
  const toVariants = to.variants ?? [];
  const made = [];
  try {
    for (const r of source) {
      const id = newId();
      const rename = (p) => `${MOCK_BUSINESS}/${to.id}/${id}/${p.split("/").pop()}`;
      const variants = Object.fromEntries(Object.entries(r.variants ?? {}).map(([w, p]) => [w, rename(p)]));
      for (const p of pathsOf(r)) {
        const bytes = state.files.get(p);
        if (!bytes) throw new ApiError("storage_failed");
        state.files.set(rename(p), new Uint8Array(bytes));
        const blob = state.blobs.get(p);
        if (blob) state.blobs.set(rename(p), blob.slice(0, blob.size, blob.type));
        made.push(rename(p));
      }
      if (atLimit(to.id, r.kind)) throw new ApiError("limit_reached");
      const at = fromVariants.findIndex((v) => v.id === r.variant_id);
      state.rows.push({
        ...r, id, item_id: to.id, path: rename(r.path), variants, poster_path: r.poster_path ? rename(r.poster_path) : null,
        variant_id: r.variant_id && at >= 0 ? toVariants[at]?.id ?? null : null, created_at: new Date().toISOString(),
      });
    }
  } catch (e) {
    dropFiles(made);
    state.rows = state.rows.filter((r) => r.item_id !== to.id);
    throw e;
  }
  return listMediaRows(to.id);
}

export const mockCustomerView = (itemId) => customerMedia(listMediaRows(itemId));
export const mockCounts = (itemId) => mediaCounts(listMediaRows(itemId));
