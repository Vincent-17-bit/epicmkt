import { supabase } from "./supabaseClient.js";

const fail = (error) => {
  if (error) throw Object.assign(new Error(error.message?.includes("reason_required") ? "reason_required" : error.message), { cause: error });
};

const fromRow = (p) => ({
  price: p.price_kes,
  items: p.items_limit,
  topBenefits: p.top_benefits,
  badge: p.badge ?? null,
  trialDays: p.trial_days ?? 0,
  features: p.features,
});

export async function listPlanCatalog() {
  const [cats, limits] = await Promise.all([
    supabase.from("categories").select("id,name,grp,tier,sort,plans(plan_key,price_kes,items_limit,top_benefits,features,badge,trial_days)").order("sort"),
    supabase.from("global_limits").select("standard,premium").eq("id", 1).single(),
  ]);
  fail(cats.error);
  fail(limits.error);
  return {
    categories: cats.data.map((c) => ({
      id: c.id,
      name: c.name,
      group: c.grp,
      tier: c.tier,
      plans: Object.fromEntries(c.plans.map((p) => [p.plan_key, fromRow(p)])),
    })),
    globalLimits: limits.data,
  };
}

export async function getPlanImpact(categoryId, planKey) {
  const live = supabase.from("businesses").select("id", { count: "exact", head: true }).eq("category_id", categoryId).eq("plan_key", planKey).eq("status", "live");
  const pending = supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId)
    .eq("plan_key", planKey)
    .in("status", ["submitted", "under_review", "changes_requested", "approved", "payment_confirming"]);
  const [a, b] = await Promise.all([live, pending]);
  fail(a.error);
  fail(b.error);
  return { liveBusinesses: a.count ?? 0, inProgressApplications: b.count ?? 0 };
}

export async function savePlans({ categoryId, values, reason }) {
  const current = (await listPlanCatalog()).categories.find((c) => c.id === categoryId);
  for (const planKey of ["standard", "premium"]) {
    const v = values[planKey];
    const c = current.plans[planKey];
    const same = ["price", "items", "badge", "trialDays"].every((k) => v[k] === c[k]) && JSON.stringify(v.topBenefits) === JSON.stringify(c.topBenefits);
    if (same) continue;
    const { error } = await supabase.rpc("save_plan", {
      p_category: categoryId,
      p_plan: planKey,
      p_patch: { price_kes: v.price, items_limit: v.items, top_benefits: v.topBenefits, badge: v.badge, trial_days: v.trialDays },
      p_reason: reason ?? null,
    });
    fail(error);
  }
  return (await listPlanCatalog()).categories.find((c) => c.id === categoryId);
}

export async function saveGlobalLimits({ limits, reason }) {
  const { data, error } = await supabase.rpc("save_global_limits", { p_standard: limits.standard, p_premium: limits.premium, p_reason: reason ?? null });
  fail(error);
  return { standard: data.standard, premium: data.premium };
}

export async function listPlanVersions({ categoryId = null, kind = "plan" } = {}) {
  let q = supabase.from("plan_versions").select("id,kind,category_id,plan_key,snapshot,reason,changed_by,created_at").eq("kind", kind).order("created_at", { ascending: false }).limit(100);
  if (kind === "plan") q = q.eq("category_id", categoryId);
  const { data, error } = await q;
  fail(error);
  return data.map((v) => ({
    id: v.id,
    kind: v.kind,
    categoryId: v.category_id,
    planKey: v.plan_key,
    reason: v.reason ?? "",
    changedBy: v.changed_by ?? "system",
    createdAt: v.created_at,
    snapshot: v.kind === "plan" ? fromRow(v.snapshot) : v.snapshot,
  }));
}

const couponFromRow = (c) => ({
  code: c.code,
  kind: c.kind,
  value: c.value,
  scopeCategory: c.scope_category,
  scopePlan: c.scope_plan,
  validFrom: c.valid_from,
  validUntil: c.valid_until,
  maxRedemptions: c.max_redemptions,
  redeemed: c.redeemed,
  active: c.active,
});

export async function listCoupons() {
  const { data, error } = await supabase.from("coupons").select("*").order("created_at", { ascending: false });
  fail(error);
  return data.map(couponFromRow);
}

export async function saveCoupon(c) {
  const { error } = await supabase.from("coupons").upsert({
    code: c.code,
    kind: c.kind,
    value: c.value,
    scope_category: c.scopeCategory,
    scope_plan: c.scopePlan,
    valid_from: c.validFrom || null,
    valid_until: c.validUntil || null,
    max_redemptions: c.maxRedemptions,
    active: c.active,
  });
  fail(error);
  return c;
}

export async function deleteCoupon(code) {
  const { error } = await supabase.from("coupons").delete().eq("code", code);
  fail(error);
}
