// Demo data for the audit viewer and analytics. Local development only.
import { ApiError } from "./errors.js";

const latency = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));
const H = 3600000;
const at = (o) => new Date(Date.now() + o).toISOString();
const entries = [
  { id: 6, created_at: at(-H), action: "item.unhide", actor_email: "reviewer@epicmkt.test", actor_role: "admin", target_type: "item", target_id: "i2", reason: null, before: { hidden_by_admin: true }, after: { hidden_by_admin: false }, business_id: "b2", business_name: "Fade Kings" },
  { id: 5, created_at: at(-26 * H), action: "plan.update", actor_email: "owner@epicmkt.test", actor_role: "admin", target_type: "plan", target_id: "bakery:standard", reason: "Inflation adjustment", before: { price_kes: 400 }, after: { price_kes: 500 }, business_id: null, business_name: null },
  { id: 4, created_at: at(-30 * H), action: "payment.confirm", actor_email: "finance@epicmkt.test", actor_role: "admin", target_type: "payment", target_id: "p1", reason: "Matched M-Pesa code", before: { status: "awaiting_confirmation" }, after: { status: "confirmed" }, business_id: "b1", business_name: "Lakeside Provisions" },
  { id: 3, created_at: at(-50 * H), action: "item.hide", actor_email: "reviewer@epicmkt.test", actor_role: "admin", target_type: "item", target_id: "i1", reason: "Misleading photo", before: { hidden_by_admin: false }, after: { hidden_by_admin: true }, business_id: "b1", business_name: "Lakeside Provisions" },
];

export async function listAudit({ search = "", action = "", actor = "", from = null, to = null, page = 0, pageSize = 50 } = {}) {
  await latency();
  if (from && to && to < from) throw new ApiError("invalid_range");
  const day = (e) => e.created_at.slice(0, 10);
  const rows = entries.filter((e) => (!action || e.action === action || e.action.startsWith(`${action}.`))
    && (!actor || e.actor_email.includes(actor.toLowerCase())) && (!from || day(e) >= from) && (!to || day(e) <= to)
    && (!search.trim() || [e.action, e.target_id, e.reason, e.business_name].some((v) => String(v ?? "").toLowerCase().includes(search.trim().toLowerCase()))));
  return { rows: rows.slice(page * pageSize, (page + 1) * pageSize), total: rows.length };
}

export async function getAuditGroups() {
  await latency();
  const n = {};
  for (const e of entries) { const g = e.action.split(".")[0]; n[g] = (n[g] ?? 0) + 1; }
  return Object.entries(n).map(([group, count]) => ({ group, n: count })).sort((a, b) => a.group.localeCompare(b.group));
}

export async function getAnalytics({ days = 30 } = {}) {
  await latency(200);
  const d = Math.min(Math.max(days, 7), 365);
  const day = (i) => new Date(Date.now() - (d - 1 - i) * 86400000).toISOString().slice(0, 10);
  const series = Array.from({ length: d }, (_, i) => ({ day: day(i), kes: [0, 500, 1300, 0, 800, 1500, 500][i % 7] * (1 + (i % 3)), payments: (i % 7) % 4 }));
  return {
    days: d, from: day(0), to: day(d - 1), can_see_money: true, can_see_applications: true,
    revenue_by_day: series, revenue_total: series.reduce((s, r) => s + r.kes, 0), mrr_kes: 41800,
    new_businesses_by_day: series.map((r, i) => ({ day: r.day, n: i % 5 === 0 ? 2 : i % 3 === 0 ? 1 : 0 })),
    businesses: { live: 38, expired: 5, suspended: 1, premium_live: 11 },
    funnel: { submitted: 40, approved: 30, activated: 24, rejected: 6 },
    by_category: [{ id: "bakery", name: "Bakery", live: 14, monthly_kes: 12400 }, { id: "barber", name: "Barber", live: 9, monthly_kes: 7800 }, { id: "grocery", name: "Grocery", live: 7, monthly_kes: 9100 }],
    renewals: { due: 20, renewed: 16 },
  };
}
