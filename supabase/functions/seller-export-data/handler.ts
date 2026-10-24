import { auditInsert, authenticate, corsHeaders, json, rateLimited, rateOk, wrap, type Deps } from "../_shared/seller.ts";

// Columns are listed where the table also holds staff-only data (migration 0008): the SMS/email log keeps provider
// errors and costs, and the audit log keeps admin e-mails, internal reasons and before/after snapshots.
const TABLES: Array<[table: string, columns: string, filter?: [column: string, value: string]]> = [
  ["items", "*"], ["item_media", "*"], ["item_history", "*"], ["faqs", "*"], ["offers", "*"], ["flags", "*"],
  ["messages", "id, business_id, kind, subject, body, data, read_at, created_at", ["channel", "in_app"]],
  ["payments", "*"], ["change_requests", "*"], ["login_events", "*"], ["seller_settings", "*"],
  ["audit_log", "id, business_id, actor_role, action, entity, entity_id, created_at"],
];

export const sellerExportData = (d: Deps) => wrap(async (req) => {
  const ctx = await authenticate(req, d.db);
  if (ctx instanceof Response) return ctx;
  if (!(await rateOk(d.db, `export:${ctx.business.id}`, 3, 3600))) return rateLimited();

  const { data: business } = await d.db.from("businesses").select("*").eq("id", ctx.business.id).maybeSingle();
  if (!business) return json({ error: "forbidden" }, 403);
  const { user_id: _u, application_id: _a, geo: _g, ...profile } = business;

  const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), business: profile };
  for (const [t, columns, filter] of TABLES) {
    let q = d.db.from(t).select(columns).eq("business_id", ctx.business.id);
    if (filter) q = q.eq(filter[0], filter[1]);
    const r = await q.limit(5000);
    out[t] = r.data ?? [];
  }
  await auditInsert(d.db, { business_id: ctx.business.id, actor_id: ctx.userId, action: "data_exported" });
  return new Response(JSON.stringify(out), {
    status: 200,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="epicmkt-export-${ctx.business.seller_id}.json"`,
    },
  });
});
