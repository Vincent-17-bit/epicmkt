// The two calls the open value inputs need, behind one small interface so the components never import the seller api directly:
//
//   source.search(kind, query, { limit }) -> { matches: Value[], canAdd, addLabel }     (the shape of seller_option_values)
//   source.add(kind, label, hex)          -> { created, value: Value }                  (the shape of seller_add_option_value)
//   Value = { id, kind, label, key, status: "pending" | "approved", hex, tags, uses }
//
// createApiSource wraps the seller api once it has the two wrappers (see docs/requests/2026-11-06-b04-to-a-option-value-api-wrappers.md).
// createLocalSource is the stand-in for local dev and tests; it follows the rules of migration 0090 using the shared helpers.
import { MAX_LABEL, cleanValueLabel, matchOpenValues, normalizeValueKey, validateOpenValue } from "@epicmkt/shared";

export const createApiSource = (api) => ({
  search: (kind, query, { limit } = {}) => api.sellerOptionValues(kind, query, limit),
  add: (kind, label, hex) => api.sellerAddOptionValue(kind, label, hex ?? null),
});

// Accepts the database shape, or a bare array of matches. When canAdd is not stated the component's own checks decide.
export function normaliseResult(raw) {
  if (Array.isArray(raw)) return { matches: raw, canAdd: true, addLabel: null };
  return { matches: Array.isArray(raw?.matches) ? raw.matches : [], canAdd: raw?.canAdd ?? true, addLabel: raw?.addLabel ?? null };
}

// TODO(contract:A18): stand-in until seller_option_values / seller_add_option_value have seller api wrappers. Never used in a production build.
export function createLocalSource(seed = [], { latencyMs = 0 } = {}) {
  let n = 0;
  const values = seed.map((v) => ({ tags: [], hex: null, uses: 0, status: "approved", mergedInto: null, ...v, key: v.key ?? normalizeValueKey(v.label), id: v.id ?? `local-${++n}` }));
  const wait = () => (latencyMs ? new Promise((r) => setTimeout(r, latencyMs)) : Promise.resolve());
  const view = (v) => ({ id: v.id, kind: v.kind, label: v.label, key: v.key, status: v.status, hex: v.hex ?? null, tags: v.tags ?? [], uses: v.uses ?? 0 });
  // The live value with this key, or the target of a merged one (same rule as option_value_resolve).
  const resolve = (kind, key) => {
    const live = values.find((v) => v.kind === kind && v.key === key && v.status !== "merged");
    if (live) return live;
    const merged = values.find((v) => v.kind === kind && v.key === key && v.status === "merged");
    return merged ? values.find((t) => t.id === merged.mergedInto && t.status !== "merged") ?? null : null;
  };
  return {
    async search(kind, query, { limit = 8 } = {}) {
      await wait();
      const label = cleanValueLabel(query).slice(0, 200);
      const key = normalizeValueKey(label);
      const exact = key ? resolve(kind, key) : null;
      const pool = values.map((v) => ({ ...v, use_count: v.uses }));
      let list = key
        ? matchOpenValues(pool, kind, label, { limit })
        : pool.filter((v) => v.kind === kind && v.status !== "merged").sort((a, b) => b.uses - a.uses || a.label.localeCompare(b.label)).slice(0, limit);
      if (exact && !list.some((v) => v.id === exact.id)) list = [exact, ...list];
      const canAdd = Boolean(key) && label.length <= MAX_LABEL && !exact;
      return { matches: list.map(view), canAdd, addLabel: canAdd ? label : null };
    },
    async add(kind, label, hex = null) {
      await wait();
      const checked = validateOpenValue({ kind, label, hex });
      if (!checked.ok) throw Object.assign(new Error(checked.error.code), { code: checked.error.code });
      const known = resolve(kind, checked.value.key);
      if (known) return { created: false, value: view(known) };
      const row = { id: `local-${++n}`, kind, label: checked.value.label, key: checked.value.key, status: "pending", hex: checked.value.hex, tags: [], uses: 0, mergedInto: null };
      values.push(row);
      return { created: true, value: view(row) };
    },
  };
}
