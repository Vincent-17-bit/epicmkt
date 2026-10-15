// Recent and pinned palette rows, kept per browser. Storage can be missing or throw (private mode), so every access is guarded.

export const RECENT_KEY = "epicmkt-admin-palette-recent";
export const PINNED_KEY = "epicmkt-admin-palette-pinned";
export const MAX_RECENT = 6;
export const MAX_PINNED = 8;

const FIELDS = ["key", "type", "id", "title", "subtitle", "badge", "copy", "pageHref"];

// Keeps only the known string fields so stale or tampered storage cannot inject anything else.
export function sanitizeRow(row) {
  if (!row || typeof row !== "object") return null;
  const out = {};
  for (const f of FIELDS) out[f] = typeof row[f] === "string" ? row[f] : "";
  return out.key && out.type && out.id && out.title ? out : null;
}

export function readList(key, storage = typeof localStorage === "undefined" ? null : localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.map(sanitizeRow).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function writeList(key, rows, storage = typeof localStorage === "undefined" ? null : localStorage) {
  try {
    storage?.setItem(key, JSON.stringify(rows));
  } catch {
    /* storage unavailable: the list just won't persist */
  }
}

export function addRecent(list, row, max = MAX_RECENT) {
  const clean = sanitizeRow(row);
  if (!clean) return list;
  return [clean, ...list.filter((r) => r.key !== clean.key)].slice(0, max);
}

export const isPinned = (list, row) => list.some((r) => r.key === row.key);

export function togglePinned(list, row, max = MAX_PINNED) {
  if (isPinned(list, row)) return list.filter((r) => r.key !== row.key);
  const clean = sanitizeRow(row);
  return clean ? [clean, ...list].slice(0, max) : list;
}
