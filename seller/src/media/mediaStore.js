import { create } from "zustand";
import { classifyFile, mediaCounts, atMediaLimit, moveInList, withSorts, sortMedia, mediaErrorMessage, newId } from "@epicmkt/shared";
import * as api from "../api/index.js";
import { prepareMedia } from "./prepare.js";
import { useToasts } from "../ui/toasts.js";

// All media state lives here, keyed by item id. Every action takes the item id it is for and keeps it for the whole
// life of the work, so an upload started for item A lands in item A even if the seller has moved on to item B,
// and the media of one item can never be drawn under another.

// These come from the checks run before upload and already say which file rule was broken and by how much.
const SPECIFIC = new Set(["too_large", "too_small", "too_long"]);

export const timing = { undoMs: 8000, lingerMs: 500, concurrency: 2 };

const emptySlice = () => ({
  media: [],            // rows the server knows, in server order
  loaded: false,
  loading: false,
  error: null,
  jobs: [],             // uploads in progress or failed, keyed by the media id they will get
  removing: {},         // media ids hidden while their Undo window is open
  limits: null,         // { photos, videos } from the plan
  itemSaved: true,      // false until the item exists in the database; uploads wait for it
  limitHit: null,       // "image" | "video" when the seller tried to go over
  notice: "",           // a live-region message for screen readers
});
export const EMPTY_SLICE = Object.freeze(emptySlice());

// Work that is not state: abort controllers, prepared files, timers, queue.
const controllers = new Map();
const prepared = new Map();
const removalTimers = new Map();
const waiters = new Map();
const orderChains = new Map();
let queue = [];
let running = 0;

export const useMediaStore = create(() => ({ byItem: {} }));
const get = () => useMediaStore.getState().byItem;
const sliceOf = (itemId) => get()[itemId] ?? EMPTY_SLICE;
const set = (itemId, fn) => useMediaStore.setState((s) => {
  const current = s.byItem[itemId] ?? emptySlice();
  const next = typeof fn === "function" ? fn(current) : { ...current, ...fn };
  return { byItem: { ...s.byItem, [itemId]: next } };
});
const patchJob = (itemId, jobId, patch) => set(itemId, (s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, ...(typeof patch === "function" ? patch(j) : patch) } : j)) }));
const dropJob = (itemId, jobId) => {
  const job = sliceOf(itemId).jobs.find((j) => j.id === jobId);
  if (job?.previewUrl?.startsWith?.("blob:")) URL.revokeObjectURL?.(job.previewUrl);
  prepared.delete(jobId);
  controllers.delete(jobId);
  set(itemId, (s) => ({ ...s, jobs: s.jobs.filter((j) => j.id !== jobId) }));
};
const toast = (message, tone = "info", extra = {}) => useToasts.getState().push({ message, tone, ...extra });

// ---- what the seller sees ----

export const ACTIVE = new Set(["queued", "processing", "uploading", "finishing", "held"]);
export const visibleMedia = (slice) => sortMedia(slice.media.filter((m) => !slice.removing[m.id]));
export const countsFor = (slice) => {
  const base = mediaCounts(visibleMedia(slice));
  for (const job of slice.jobs) {
    if (!ACTIVE.has(job.status) || job.replacing) continue;
    base[job.kind === "video" ? "videos" : "photos"] += 1;
  }
  return base;
};

// ---- loading ----

export async function load(itemId, { force = false } = {}) {
  const s = sliceOf(itemId);
  if (!force && (s.loaded || s.loading)) return;
  set(itemId, { loading: true, error: null });
  try {
    const rows = await api.listMedia(itemId);
    set(itemId, (c) => ({ ...c, media: rows, loaded: true, loading: false }));
  } catch (error) {
    set(itemId, { loading: false, error });
  }
}

export const configure = (itemId, { limits, itemSaved }) => {
  const current = sliceOf(itemId);
  const patch = {};
  if (limits && (current.limits?.photos !== limits.photos || current.limits?.videos !== limits.videos)) patch.limits = limits;
  if (itemSaved !== undefined && current.itemSaved !== itemSaved) {
    patch.itemSaved = itemSaved;
    // An item that was not saved yet has no media on the server, so there is nothing to load once it is.
    if (itemSaved && !current.loaded) patch.loaded = true;
  }
  if (Object.keys(patch).length) set(itemId, patch);
  if (itemSaved) for (const wake of waiters.get(itemId) ?? []) wake();
  if (itemSaved) waiters.delete(itemId);
};

// ---- adding files ----

function fail(itemId, name, code, message, kind = "image") {
  const id = newId();
  set(itemId, (s) => ({ ...s, jobs: [...s.jobs, { id, name, kind, status: "error", phase: "", progress: 0, error: { code, message }, retryable: false }] }));
  return id;
}

export function addFiles(itemId, files, { replacing = null } = {}) {
  const list = [...files];
  const refused = [];
  for (const file of list) {
    const guess = classifyFile(file);
    if (!guess) { fail(itemId, file.name, "unsupported_type", mediaErrorMessage("unsupported_type")); refused.push(file.name); continue; }
    const slice = sliceOf(itemId);
    const kind = guess.kind;
    if (!replacing && slice.limits && atMediaLimit(countsFor(sliceOf(itemId)), slice.limits, kind)) {
      // The count that matters to the server includes removals still waiting out their Undo window.
      set(itemId, { limitHit: kind });
      fail(itemId, file.name, "limit_reached", mediaErrorMessage("limit_reached"), kind);
      continue;
    }
    const id = replacing ?? newId();
    const preview = !replacing && kind === "image" && typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(file) : null;
    const job = { id, name: file.name, size: file.size, kind, status: "queued", phase: "", progress: 0, error: null, warning: null, summary: "", previewUrl: preview, replacing, file };
    set(itemId, (s) => ({ ...s, jobs: [...s.jobs.filter((j) => j.id !== id), job], limitHit: s.limitHit }));
    queue.push({ itemId, jobId: id, file });
  }
  pump();
  return list.length - refused.length;
}

function pump() {
  while (running < timing.concurrency && queue.length) {
    const next = queue.shift();
    if (!sliceOf(next.itemId).jobs.some((j) => j.id === next.jobId)) continue;
    running += 1;
    run(next).finally(() => { running -= 1; pump(); });
  }
}

async function flushRemovals(itemId) {
  const ids = Object.keys(sliceOf(itemId).removing);
  await Promise.all(ids.map((id) => commitRemoval(itemId, id)));
}

async function run({ itemId, jobId, file }) {
  const controller = new AbortController();
  controllers.set(jobId, controller);
  const { signal } = controller;
  try {
    patchJob(itemId, jobId, { status: "processing", error: null });
    let prep = prepared.get(jobId);
    if (!prep) {
      prep = await prepareMedia(file, { signal, onProgress: (f) => patchJob(itemId, jobId, { phase: "processing", progress: f * 0.3 }) });
      prepared.set(jobId, prep);
    }
    patchJob(itemId, jobId, { kind: prep.kind, warning: prep.warning, summary: prep.summary ?? "", progress: 0.3, phase: "processing" });

    // The item may not exist in the database yet (a new row with no name). Wait until it has been saved.
    if (!sliceOf(itemId).itemSaved) {
      patchJob(itemId, jobId, { status: "held", phase: "waiting" });
      await new Promise((resolve) => { waiters.set(itemId, [...(waiters.get(itemId) ?? []), resolve]); signal.addEventListener("abort", resolve, { once: true }); });
      if (signal.aborted) throw Object.assign(new Error("cancelled"), { code: "cancelled" });
    }
    const job = sliceOf(itemId).jobs.find((j) => j.id === jobId);
    const slice = sliceOf(itemId);
    // Undo windows hold slots on the server. Free them now if this upload needs one.
    if (Object.keys(slice.removing).length && slice.limits) {
      const serverCounts = mediaCounts(slice.media);
      if (atMediaLimit(serverCounts, slice.limits, prep.kind)) await flushRemovals(itemId);
    }
    patchJob(itemId, jobId, { status: "uploading", phase: "uploading", progress: 0.3 });
    const row = await api.uploadMedia(itemId, file, (fraction, phase) => {
      patchJob(itemId, jobId, { progress: Math.max(0.3, fraction), phase: phase === "done" ? "finishing" : phase, status: phase === "finishing" ? "finishing" : "uploading" });
    }, { signal, mediaId: jobId, replaceMediaId: job?.replacing ?? undefined, prepared: prep });
    set(itemId, (s) => ({ ...s, media: [...s.media.filter((m) => m.id !== row.id), row], notice: `${row.kind === "video" ? "Video" : "Photo"} added.` }));
    if (row.status === "failed") toast("That video was added, but shoppers cannot play it. Export it as MP4 (H.264) and replace it.", "error");
    patchJob(itemId, jobId, { status: "done", progress: 1 });
    setTimeout(() => dropJob(itemId, jobId), timing.lingerMs);
  } catch (e) {
    if (e?.code === "cancelled" || signal.aborted) { dropJob(itemId, jobId); return; }
    const code = e?.code ?? "request_failed";
    // A refused file cannot be fixed by trying again; a network or server hiccup can.
    const retryable = !["unsupported_type", "too_large", "too_small", "too_long", "unreadable", "heic_unsupported", "mov_unplayable", "unsupported_codec", "too_big_dimensions", "limit_reached"].includes(code);
    if (!retryable) prepared.delete(jobId);
    if (code === "limit_reached") set(itemId, { limitHit: sliceOf(itemId).jobs.find((j) => j.id === jobId)?.kind === "video" ? "video" : "image" });
    patchJob(itemId, jobId, { status: "error", error: { code, message: e?.code === "network" || !e?.code ? mediaErrorMessage(code) : SPECIFIC.has(code) && e.message ? e.message : mediaErrorMessage(code, e.message) }, retryable });
  } finally {
    controllers.delete(jobId);
  }
}

export function cancelJob(itemId, jobId) {
  const job = sliceOf(itemId).jobs.find((j) => j.id === jobId);
  if (!job) return;
  const controller = controllers.get(jobId);
  if (controller) { controller.abort(); return; }
  queue = queue.filter((q) => q.jobId !== jobId);
  dropJob(itemId, jobId);
}

export function retryJob(itemId, jobId) {
  const job = sliceOf(itemId).jobs.find((j) => j.id === jobId);
  if (!job?.file) return;
  patchJob(itemId, jobId, { status: "queued", error: null, progress: 0 });
  queue.push({ itemId, jobId, file: job.file });
  pump();
}

export const dismissJob = dropJob;
export const dismissLimit = (itemId) => set(itemId, { limitHit: null });

// ---- order ----

function persistOrder(itemId) {
  const chain = (orderChains.get(itemId) ?? Promise.resolve()).then(async () => {
    const slice = sliceOf(itemId);
    const ordered = [...visibleMedia(slice).map((m) => m.id), ...slice.media.filter((m) => slice.removing[m.id]).map((m) => m.id)];
    try {
      await api.reorderMedia(itemId, ordered);
    } catch {
      toast("Could not save the new order. Reloading your photos.", "error");
      await load(itemId, { force: true });
    }
  });
  orderChains.set(itemId, chain);
  return chain;
}

export function reorder(itemId, orderedIds) {
  const slice = sliceOf(itemId);
  const byId = new Map(slice.media.map((m) => [m.id, m]));
  const next = withSorts(orderedIds.map((id) => byId.get(id)).filter(Boolean));
  const rest = slice.media.filter((m) => !orderedIds.includes(m.id)).map((m, i) => ({ ...m, sort: next.length + i }));
  set(itemId, (s) => ({ ...s, media: [...next, ...rest], notice: "Order updated." }));
  return persistOrder(itemId);
}

export function moveMedia(itemId, mediaId, to) {
  const list = visibleMedia(sliceOf(itemId));
  const from = list.findIndex((m) => m.id === mediaId);
  if (from < 0 || to < 0 || to >= list.length || from === to) return Promise.resolve();
  const moved = moveInList(list, from, to);
  const name = list[from].kind === "video" ? "Video" : "Photo";
  const done = reorder(itemId, moved.map((m) => m.id));
  set(itemId, { notice: `${name} moved to position ${to + 1} of ${list.length}.` });
  return done;
}

// The cover is the first image, so making one the cover means putting it first.
export const setCover = (itemId, mediaId) => moveMedia(itemId, mediaId, 0);

// ---- edits ----

export async function updateMedia(itemId, mediaId, patch) {
  const before = sliceOf(itemId).media.find((m) => m.id === mediaId);
  if (!before) return;
  set(itemId, (s) => ({ ...s, media: s.media.map((m) => (m.id === mediaId ? { ...m, ...patch } : m)) }));
  try {
    const row = await api.updateMedia(mediaId, {
      ...("alt" in patch ? { alt: patch.alt } : {}),
      ...("variantId" in patch ? { variantId: patch.variantId } : {}),
    });
    set(itemId, (s) => ({ ...s, media: s.media.map((m) => (m.id === mediaId ? { ...m, alt: row.alt, variantId: row.variantId } : m)) }));
  } catch (e) {
    set(itemId, (s) => ({ ...s, media: s.media.map((m) => (m.id === mediaId ? { ...m, alt: before.alt, variantId: before.variantId } : m)) }));
    toast(mediaErrorMessage(e?.code), "error");
  }
}

export async function setPoster(itemId, mediaId, input) {
  set(itemId, (s) => ({ ...s, media: s.media.map((m) => (m.id === mediaId ? { ...m, posterBusy: true } : m)) }));
  try {
    const row = await api.setPoster(mediaId, input);
    set(itemId, (s) => ({ ...s, media: s.media.map((m) => (m.id === mediaId ? row : m)), notice: "Poster updated." }));
    return row;
  } catch (e) {
    set(itemId, (s) => ({ ...s, media: s.media.map((m) => (m.id === mediaId ? { ...m, posterBusy: false } : m)) }));
    toast(mediaErrorMessage(e?.code, "Could not change the poster. Try again."), "error");
    return null;
  }
}

// ---- removing, with Undo ----

async function commitRemoval(itemId, mediaId) {
  const timer = removalTimers.get(mediaId);
  if (!timer) return;
  clearTimeout(timer);
  removalTimers.delete(mediaId);
  try {
    await api.removeMedia(mediaId);
    set(itemId, (s) => ({ ...s, media: s.media.filter((m) => m.id !== mediaId), removing: Object.fromEntries(Object.entries(s.removing).filter(([id]) => id !== mediaId)) }));
  } catch {
    set(itemId, (s) => ({ ...s, removing: Object.fromEntries(Object.entries(s.removing).filter(([id]) => id !== mediaId)) }));
    toast("Could not remove that file. It is back in your list.", "error");
  }
}

export function removeMedia(itemId, mediaId) {
  const row = sliceOf(itemId).media.find((m) => m.id === mediaId);
  if (!row || removalTimers.has(mediaId)) return;
  set(itemId, (s) => ({ ...s, removing: { ...s.removing, [mediaId]: true }, notice: `${row.kind === "video" ? "Video" : "Photo"} removed.` }));
  removalTimers.set(mediaId, setTimeout(() => commitRemoval(itemId, mediaId), timing.undoMs + 250));
  toast(`${row.kind === "video" ? "Video" : "Photo"} removed.`, "info", {
    actionLabel: "Undo",
    ms: timing.undoMs,
    onAction: () => {
      clearTimeout(removalTimers.get(mediaId));
      removalTimers.delete(mediaId);
      set(itemId, (s) => ({ ...s, removing: Object.fromEntries(Object.entries(s.removing).filter(([id]) => id !== mediaId)), notice: "Restored." }));
    },
  });
}

export const flushRemovalsNow = flushRemovals;

// ---- the item itself ----

// The item row was deleted or an unsaved row was discarded: nothing is left to show, and nothing may be uploaded.
export function purge(itemId) {
  for (const job of sliceOf(itemId).jobs) { controllers.get(job.id)?.abort(); prepared.delete(job.id); }
  queue = queue.filter((q) => q.itemId !== itemId);
  for (const id of Object.keys(sliceOf(itemId).removing)) { clearTimeout(removalTimers.get(id)); removalTimers.delete(id); }
  for (const wake of waiters.get(itemId) ?? []) wake();
  waiters.delete(itemId);
  useMediaStore.setState((s) => { const { [itemId]: _gone, ...rest } = s.byItem; return { byItem: rest }; });
}

export const adoptMedia = (itemId, rows) => set(itemId, (s) => ({ ...s, media: rows, loaded: true, loading: false }));

export function resetMediaStore() {
  for (const c of controllers.values()) c.abort();
  for (const t of removalTimers.values()) clearTimeout(t);
  controllers.clear(); prepared.clear(); removalTimers.clear(); waiters.clear(); orderChains.clear();
  queue = []; running = 0;
  useMediaStore.setState({ byItem: {} });
}

if (typeof window !== "undefined") {
  // Closing the tab inside an Undo window: finish the removals. If the tab dies first, nothing is lost: the media is back next time.
  window.addEventListener("pagehide", () => { for (const [itemId, slice] of Object.entries(get())) for (const id of Object.keys(slice.removing)) commitRemoval(itemId, id); });
}
