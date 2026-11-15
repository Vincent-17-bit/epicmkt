// Puts quantity tiers (migration 0117) on an item detail. Pure, so it can be tested without a database.
export const withTiers = (detail, tiers) => {
  if (!tiers) return detail;
  const own = Array.isArray(tiers.variants) ? tiers.variants : [];
  const same = (a, b) => a && b && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]);
  return {
    ...detail,
    ...(Array.isArray(tiers.tiers) && tiers.tiers.length > 0 && { priceTiers: tiers.tiers, priceTierMode: tiers.mode === "graduated" ? "graduated" : "whole" }),
    ...(Array.isArray(detail.optionVariants) && own.length > 0 && { optionVariants: detail.optionVariants.map((v) => { const hit = own.find((o) => same(o.choice, v.choice)); return hit ? { ...v, priceTiers: hit.tiers } : v; }) })
  };
};
