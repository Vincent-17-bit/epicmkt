// Saved views for tables: a named snapshot of the filters, sort, columns and density, kept in this browser.
// Nothing here knows about React. `storage` can be swapped for a fake in tests and falls back to memory when the
// browser blocks storage (private windows), so the buttons keep working until the tab is closed.

export const MAX_VIEWS = 20;
export const MAX_NAME = 40;

const memory = new Map();
const fallback = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => { memory.set(k, v); }, removeItem: (k) => { memory.delete(k); } };

function defaultStorage() {
  try { return typeof localStorage === "undefined" ? fallback : localStorage; } catch { return fallback; }
}

export const viewsKey = (tableId, scope = "") => `epicmkt-admin-views:${tableId}${scope ? `:${scope}` : ""}`;

const empty = () => ({ views: [], defaultId: null });
const isPlain = (v) => v && typeof v === "object" && !Array.isArray(v);

/** Reads and validates whatever is stored. Bad data becomes "no views", never an error. */
export function loadViews(tableId, { scope = "", storage = defaultStorage() } = {}) {
  let raw = null;
  try { raw = JSON.parse(storage.getItem(viewsKey(tableId, scope)) ?? "null"); } catch { return empty(); }
  if (!isPlain(raw) || !Array.isArray(raw.views)) return empty();
  const views = raw.views
    .filter((v) => isPlain(v) && typeof v.id === "string" && typeof v.name === "string" && v.name.trim() && isPlain(v.state))
    .slice(0, MAX_VIEWS)
    .map((v) => ({ id: v.id, name: v.name.trim().slice(0, MAX_NAME), state: v.state, savedAt: Number(v.savedAt) || 0 }));
  const defaultId = views.some((v) => v.id === raw.defaultId) ? raw.defaultId : null;
  return { views, defaultId };
}

function persist(tableId, data, { scope = "", storage = defaultStorage() } = {}) {
  try { storage.setItem(viewsKey(tableId, scope), JSON.stringify(data)); } catch { memory.set(viewsKey(tableId, scope), JSON.stringify(data)); }
  return data;
}

const newId = () => `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const cleanName = (name) => String(name ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);

/**
 * Saves `state` under `name`. A name that already exists (ignoring case) is replaced rather than duplicated.
 * Returns { data, view } or { error } with a message for the person.
 */
export function saveView(tableId, name, state, opts = {}) {
  const clean = cleanName(name);
  if (!clean) return { error: "Give the view a name." };
  const data = loadViews(tableId, opts);
  const at = data.views.findIndex((v) => v.name.toLowerCase() === clean.toLowerCase());
  if (at < 0 && data.views.length >= MAX_VIEWS) return { error: `You can keep up to ${MAX_VIEWS} views. Delete one first.` };
  const view = { id: at >= 0 ? data.views[at].id : newId(), name: clean, state: JSON.parse(JSON.stringify(state ?? {})), savedAt: Date.now() };
  const views = at >= 0 ? data.views.map((v, i) => (i === at ? view : v)) : [...data.views, view];
  return { data: persist(tableId, { views, defaultId: data.defaultId }, opts), view };
}

export function deleteView(tableId, id, opts = {}) {
  const data = loadViews(tableId, opts);
  const views = data.views.filter((v) => v.id !== id);
  return persist(tableId, { views, defaultId: data.defaultId === id ? null : data.defaultId }, opts);
}

/** id = null clears the default. An unknown id is ignored. */
export function setDefaultView(tableId, id, opts = {}) {
  const data = loadViews(tableId, opts);
  return persist(tableId, { views: data.views, defaultId: data.views.some((v) => v.id === id) ? id : null }, opts);
}

export const findView = (data, id) => data.views.find((v) => v.id === id) ?? null;

// ---- per-table preferences (visible columns, density), remembered even without a saved view ------------------------

export const prefsKey = (tableId) => `epicmkt-admin-table:${tableId}`;

export function loadPrefs(tableId, { storage = defaultStorage() } = {}) {
  try {
    const raw = JSON.parse(storage.getItem(prefsKey(tableId)) ?? "null");
    if (!isPlain(raw)) return {};
    return {
      columns: Array.isArray(raw.columns) ? raw.columns.filter((k) => typeof k === "string").slice(0, 50) : undefined,
      density: raw.density === "compact" || raw.density === "comfortable" ? raw.density : undefined,
    };
  } catch { return {}; }
}

export function savePrefs(tableId, prefs, { storage = defaultStorage() } = {}) {
  try { storage.setItem(prefsKey(tableId), JSON.stringify(prefs)); } catch { memory.set(prefsKey(tableId), JSON.stringify(prefs)); }
}
