// Saved views for the Businesses table: a name plus the list state (tab, search, sort, filters). Per browser, in
// localStorage, so every read and write is guarded: private windows and blocked storage must not break the page.
import { DEFAULT_LIST } from "./businesses.js";

const KEY = "epicmkt-admin-business-views";
const MAX = 12;

function storage() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function sanitizeView(v) {
  if (!v || typeof v !== "object" || typeof v.name !== "string") return null;
  const name = v.name.trim().slice(0, 40);
  if (!name) return null;
  const list = v.list && typeof v.list === "object" ? v.list : {};
  return {
    name,
    list: {
      tab: typeof list.tab === "string" ? list.tab : DEFAULT_LIST.tab,
      q: typeof list.q === "string" ? list.q.slice(0, 100) : "",
      sort: typeof list.sort === "string" ? list.sort : DEFAULT_LIST.sort,
      dir: list.dir === "desc" ? "desc" : "asc",
      page: 1,
      filters: list.filters && typeof list.filters === "object" && !Array.isArray(list.filters) ? { ...list.filters } : {},
    },
  };
}

export function readViews(store = storage()) {
  try {
    const raw = JSON.parse(store?.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.map(sanitizeView).filter(Boolean).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function write(views, store) {
  try {
    store?.setItem(KEY, JSON.stringify(views.slice(0, MAX)));
  } catch {
    /* storage full or blocked: the view just will not persist */
  }
  return views;
}

// Saving under an existing name replaces it.
export function saveView(name, list, store = storage()) {
  const view = sanitizeView({ name, list });
  if (!view) return readViews(store);
  const rest = readViews(store).filter((v) => v.name.toLowerCase() !== view.name.toLowerCase());
  return write([view, ...rest], store);
}

export function deleteView(name, store = storage()) {
  return write(readViews(store).filter((v) => v.name !== name), store);
}
