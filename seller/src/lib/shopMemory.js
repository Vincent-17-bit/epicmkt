const stamp = (i) => String(i.updatedAt ?? i.createdAt ?? "");
const clean = (v) => (typeof v === "string" ? v.trim() : "");
const spec = (item, label) => clean((item.specs ?? []).find((s) => clean(s?.label).toLowerCase() === label)?.value);

export function shopMemory(items = []) {
  const out = {};
  const newest = [...items].filter((i) => i.productTypeId && !i.removedByAdmin).sort((a, b) => stamp(b).localeCompare(stamp(a)));
  for (const item of newest) {
    const mine = (out[item.productTypeId] ??= {});
    for (const [field, value] of [["brand", clean(item.brand)], ["warranty", spec(item, "warranty")], ["condition", spec(item, "condition")]]) {
      if (value && !mine[field]) mine[field] = value;
    }
  }
  return out;
}

export const chipsFor = (memory, typeId) =>
  Object.entries(memory?.[typeId] ?? {}).map(([field, value]) => ({ field, value }));
