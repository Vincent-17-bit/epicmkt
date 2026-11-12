// The value list of one axis, with no React. A list is an array of stored scale values ({scale, system?, value, unit?, width?, shape?}), in the seller's order.
// Every change is a pure function from one list to the next, so the rules are tested without a screen.
import { scales } from "@epicmkt/shared";

export const MAX_VALUES = scales.MAX_AXIS_VALUES;

/** Two values are the same size when their sizeKey and width match ("1000 g" and "1 kg" are merged too, through toBase). */
export function identity(value) {
  let key = `${scales.sizeKey(value)}|${value.width ?? ""}`;
  try {
    const base = scales.toBase(value);
    const flat = Array.isArray(base) ? base : [base];
    if (flat.length && flat.every((n) => typeof n === "number" && Number.isFinite(n))) {
      key = `base|${value.scale}|${value.system ?? ""}|${value.width ?? ""}|${flat.map((n) => Math.round(n * 1e6) / 1e6).join(",")}`;
    }
  } catch { /* labels and models have no base amount: keep the sizeKey */ }
  return key;
}

/**
 * add(list, raw, { scaleId, ctx }) ->
 *   { ok: true, list, added: value, merged: false }            a new value at the end
 *   { ok: true, list, added: value, merged: true, into: value } the same size is already there; the list is unchanged
 *   { ok: false, error: { code, message, needs?, options? } }
 * `raw` is typed text or a stored value.
 */
export function add(list, raw, { scaleId, ctx = {} }) {
  if (list.length >= MAX_VALUES) return { ok: false, error: { code: "too-many-values", message: `You can add up to ${MAX_VALUES} values.` } };
  const res = scales.parse(scaleId, raw, ctx);
  if (!res.ok) return res;
  const id = identity(res.value);
  const same = list.find((v) => identity(v) === id);
  if (same) return { ok: true, list, added: res.value, merged: true, into: same };
  return { ok: true, list: [...list, res.value], added: res.value, merged: false };
}

/** addMany: raw strings one after another. Returns { list, added: n, merged: n, errors: [{raw, error}] }. */
export function addMany(list, raws, opts) {
  let next = list;
  let added = 0;
  let merged = 0;
  const errors = [];
  for (const raw of raws) {
    const r = add(next, raw, opts);
    if (!r.ok) { errors.push({ raw, error: r.error }); if (r.error.code === "too-many-values") break; continue; }
    if (r.merged) merged += 1;
    else { added += 1; next = r.list; }
  }
  return { list: next, added, merged, errors };
}

export const remove = (list, i) => (i >= 0 && i < list.length ? list.filter((_, k) => k !== i) : list);

export function move(list, i, step) {
  const to = i + step;
  if (i < 0 || i >= list.length || to < 0 || to >= list.length) return list;
  const out = [...list];
  [out[i], out[to]] = [out[to], out[i]];
  return out;
}

/** The list in the scale's own order (smallest first). */
export const sorted = (list) => [...list].sort(scales.compare);
export const isSorted = (list) => list.every((v, i) => i === 0 || scales.compare(list[i - 1], v) <= 0);

/** A dry run of one value the seller is typing: { state: "empty" | "ok" | "error", value?, label?, error? }. */
export function inspect(raw, { scaleId, ctx = {} }) {
  if (String(raw ?? "").trim() === "") return { state: "empty" };
  const res = scales.parse(scaleId, raw, ctx);
  if (!res.ok) return { state: "error", error: res.error };
  return { state: "ok", value: res.value, label: scales.format(res.value) };
}

export const labels = (list) => list.map((v) => scales.format(v));

/** Plausibility notes for a list: [{ index, ok, warn }] for the values that are unusual or impossible. */
export function checks(list, typeId, axisKey) {
  if (!typeId || !axisKey) return [];
  return list.flatMap((v, index) => {
    const p = scales.plausible(typeId, axisKey, v);
    return !p.ok || p.warn ? [{ index, ok: p.ok, warn: p.warn }] : [];
  });
}

/**
 * Quick-pick range: raw strings from `from` to `to` by `step`, each with the suffix (a unit or a system word) the scale needs.
 * rangeRaws({from: 38, to: 47, step: 0.5, suffix: "EU"}) -> ["38 EU", "38.5 EU", ...]. Returns { ok, raws } or { ok: false, message }.
 */
export function rangeRaws({ from, to, step, suffix = "", prefix = "" }, max = MAX_VALUES) {
  const a = Number(from);
  const b = Number(to);
  const s = Number(step);
  if (![a, b, s].every(Number.isFinite) || String(from).trim() === "" || String(to).trim() === "") return { ok: false, message: "Enter a start, an end and a step." };
  if (s <= 0) return { ok: false, message: "The step must be more than zero." };
  if (b < a) return { ok: false, message: "The end must not be below the start." };
  const count = Math.floor((b - a) / s + 1e-9) + 1;
  if (count > max) return { ok: false, message: `That makes ${count} values. You can add up to ${max}.` };
  const raws = Array.from({ length: count }, (_, i) => {
    const n = Math.round((a + i * s) * 1e6) / 1e6;
    return [prefix, String(n), suffix].filter(Boolean).join(" ");
  });
  return { ok: true, raws };
}
