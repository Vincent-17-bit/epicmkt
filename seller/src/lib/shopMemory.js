// The shop's last brand, warranty and condition per product type, offered as one-tap chips (B17). Kept on this device only.
const KEY = "epicmkt.shopMemory.v1";
export const MEMORY_FIELDS = ["brand", "warranty", "condition"];

const read = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
};

/** Remember what was just saved for a type. Empty values are ignored; the newest value goes first, at most 3 per field. */
export function remember(typeId, values) {
  if (!typeId) return;
  const all = read();
  const mine = { ...(all[typeId] ?? {}) };
  for (const f of MEMORY_FIELDS) {
    const v = String(values?.[f] ?? "").trim().slice(0, 60);
    if (!v) continue;
    mine[f] = [v, ...(mine[f] ?? []).filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 3);
  }
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...all, [typeId]: mine }));
  } catch {
    /* private mode or full storage: memory is a convenience */
  }
}

/** Remembered values for one field of one type, newest first. */
export const recall = (typeId, field) => (typeId && read()[typeId]?.[field]) || [];

/** Which memory field a type's row belongs to, or null. */
export const memoryFieldOfRow = (row) => {
  const text = `${row?.key ?? ""} ${row?.label ?? ""}`.toLowerCase();
  return MEMORY_FIELDS.find((f) => f !== "brand" && text.includes(f)) ?? null;
};
