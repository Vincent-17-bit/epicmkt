import { json, readJson, wrap, z } from "../_shared/seller.ts";
import { corsHeaders } from "../_shared/http.ts";
import { writeAudit } from "../_shared/audit.ts";
import { isResponse, limitAdmin, requireRole, toCsv, type AdminRole, type OutboundDeps } from "../_shared/outbound.ts";

// CSV (or JSON) export of an admin dataset. Every export is recorded in the audit log.
//
// Columns are an explicit allow-list per dataset: nothing is exported by `select *`, so a column added to a table
// later is not exposed by accident. Message bodies, recipient addresses and applicant ID documents are not exported.

export const MAX_ROWS = 10_000;
const PAGE = 1000; // PostgREST returns at most one page per request

type Dataset = { table: string; roles: AdminRole[]; dateColumn: string; columns: string[] };

export const DATASETS: Record<string, Dataset> = {
  payments: {
    table: "payments", roles: ["owner", "finance"], dateColumn: "created_at",
    columns: ["id", "business_id", "amount_kes", "method", "kind", "status", "mpesa_code", "reference", "receipt_no", "plan_key", "category_id", "period_start", "period_end", "submitted_at", "confirmed_at", "created_at"],
  },
  businesses: {
    table: "businesses", roles: ["owner", "support"], dateColumn: "created_at",
    columns: ["id", "seller_id", "slug", "name", "category_id", "plan_key", "status", "verification_level", "featured", "paid_until", "phone", "email", "county", "town", "created_at"],
  },
  messages: {
    table: "messages", roles: ["owner", "support"], dateColumn: "created_at",
    columns: ["id", "business_id", "application_id", "channel", "kind", "template_key", "subject", "status", "attempts", "transactional", "provider_id", "error", "cost_kes", "scheduled_at", "sent_at", "created_at"],
  },
  audit: {
    table: "audit_log", roles: ["owner"], dateColumn: "created_at",
    columns: ["id", "created_at", "actor_role", "actor_id", "business_id", "action", "entity", "entity_id"],
  },
};

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "bad_date");

const Body = z.object({
  dataset: z.enum(["payments", "businesses", "messages", "audit"]),
  format: z.enum(["csv", "json"]).default("csv"),
  from: day.optional(), // inclusive, Nairobi calendar day
  to: day.optional(),   // inclusive
}).refine((v) => !v.from || !v.to || v.from <= v.to, "from_after_to");

const nairobiStart = (s: string) => new Date(`${s}T00:00:00+03:00`);

export const adminExport = (d: OutboundDeps) => wrap(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "bad_request", issues: parsed.error.issues.map((i) => i.message) }, 422);
  const b = parsed.data;
  const ds = DATASETS[b.dataset];

  const actor = await requireRole(req, d.db, ds.roles);
  if (isResponse(actor)) return actor;
  const limited = await limitAdmin(d, actor, "export");
  if (limited) return limited;

  const gte = b.from ? nairobiStart(b.from).toISOString() : null;
  const lt = b.to ? new Date(nairobiStart(b.to).getTime() + 86_400_000).toISOString() : null;

  const rows: Record<string, unknown>[] = [];
  for (let start = 0; rows.length <= MAX_ROWS; start += PAGE) {
    let q = d.db.from(ds.table).select(ds.columns.join(","));
    if (gte) q = q.gte(ds.dateColumn, gte);
    if (lt) q = q.lt(ds.dateColumn, lt);
    const { data, error } = await q.order(ds.dateColumn, { ascending: false }).order("id").range(start, start + PAGE - 1);
    if (error) return json({ error: "server_error" }, 500);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  const truncated = rows.length > MAX_ROWS;
  if (truncated) rows.length = MAX_ROWS;

  await writeAudit(d.db, {
    actor: { id: actor.userId, email: actor.email },
    action: "export.run",
    targetType: b.dataset,
    after: { dataset: b.dataset, format: b.format, from: b.from ?? null, to: b.to ?? null, rows: rows.length, truncated },
    req,
  });

  if (b.format === "json") return json({ ok: true, dataset: b.dataset, count: rows.length, truncated, rows });

  const stamp = d.now().toISOString().slice(0, 10).replace(/-/g, "");
  return new Response(toCsv(ds.columns, rows), {
    status: 200,
    headers: {
      ...corsHeaders(),
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="epicmkt-${b.dataset}-${stamp}.csv"`,
      "Cache-Control": "no-store",
      "X-Export-Rows": String(rows.length),
      "X-Export-Truncated": String(truncated),
      "Access-Control-Expose-Headers": "Content-Disposition, X-Export-Rows, X-Export-Truncated",
    },
  });
});
