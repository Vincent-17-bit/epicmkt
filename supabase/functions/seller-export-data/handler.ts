import { auditInsert, authenticate, corsHeaders, json, rateLimited, rateOk, wrap, type Deps } from "../_shared/seller.ts";

const TABLES = ["items", "item_media", "item_history", "faqs", "offers", "flags", "messages", "payments", "change_requests", "login_events", "seller_settings", "audit_log"];

export const sellerExportData = (d: Deps) => wrap(async (req) => {
  const ctx = await authenticate(req, d.db);
  if (ctx instanceof Response) return ctx;
  if (!(await rateOk(d.db, `export:${ctx.business.id}`, 3, 3600))) return rateLimited();

  const { data: business } = await d.db.from("businesses").select("*").eq("id", ctx.business.id).maybeSingle();
  if (!business) return json({ error: "forbidden" }, 403);
  const { user_id: _u, application_id: _a, ...profile } = business;

  const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), business: profile };
  for (const t of TABLES) {
    const r = await d.db.from(t).select("*").eq("business_id", ctx.business.id).limit(5000);
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
