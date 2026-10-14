// Writes a SeedData set to Postgres and removes it again. Works on any pg-style client.
import { Json, TABLE_ORDER, DEMO, type Row, type SeedData, type SeedTable } from "./seed-data.ts";

// deno-lint-ignore no-explicit-any
export type Client = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

const MAX_PARAMS = 60_000;
const quote = (id: string) => `"${id.replace(/"/g, '""')}"`;

export async function insertMany(db: Client, table: string, rows: Row[], opts: { onConflictDoNothing?: string } = {}): Promise<number> {
  if (!rows.length) return 0;
  const cols = Object.keys(rows[0]);
  for (const r of rows) {
    const keys = Object.keys(r);
    if (keys.length !== cols.length || keys.some((k, i) => k !== cols[i])) throw new Error(`${table}: rows must all have the same columns (${cols.join(", ")})`);
  }
  const perChunk = Math.max(1, Math.floor(MAX_PARAMS / cols.length));
  let total = 0;
  for (let i = 0; i < rows.length; i += perChunk) {
    const chunk = rows.slice(i, i + perChunk);
    const params: unknown[] = [];
    const tuples = chunk.map((r) => `(${cols.map((c) => {
      const v = r[c];
      params.push(v instanceof Json ? JSON.stringify(v.value) : v === undefined ? null : v);
      return `$${params.length}`;
    }).join(", ")})`);
    const conflict = opts.onConflictDoNothing ? ` on conflict (${opts.onConflictDoNothing}) do nothing` : "";
    const res = await db.query(`insert into public.${quote(table)} (${cols.map(quote).join(", ")}) values ${tuples.join(", ")}${conflict}`, params);
    total += res.rowCount ?? chunk.length;
  }
  return total;
}

/** Categories and plans already in the database. The demo data must point at rows that exist. */
export async function readCatalog(db: Client) {
  const categories = (await db.query(`select id, name, grp, tier from public.categories where active order by sort, id`)).rows;
  const plans = (await db.query(`select category_id, plan_key, price_kes, items_limit from public.plans`)).rows;
  return { categories, plans };
}

const DEMO_BIZ = `select id from public.businesses where seller_id like '${DEMO.sellerPrefix}%'`;
const DEMO_APP = `select id from public.applications where reference_no like 'EPM-%-${DEMO.refMarker}%'`;

export async function demoExists(db: Client): Promise<boolean> {
  const r = await db.query(`select (select count(*) from public.businesses where seller_id like '${DEMO.sellerPrefix}%')
                                + (select count(*) from public.applications where reference_no like 'EPM-%-${DEMO.refMarker}%') as n`);
  return Number(r.rows[0].n) > 0;
}

/** Removes exactly the demo rows (and what hangs off them). Message templates are kept: they are content, not demo data. */
export async function resetDemo(db: Client): Promise<void> {
  await db.query(`delete from public.admin_notifications where business_id in (${DEMO_BIZ}) or data ->> 'application_id' in (select id::text from public.applications where reference_no like 'EPM-%-${DEMO.refMarker}%')`);
  await db.query(`delete from public.messages where business_id in (${DEMO_BIZ}) or application_id in (${DEMO_APP})`);
  await db.query(`delete from public.businesses where seller_id like '${DEMO.sellerPrefix}%'`); // cascades items, media, faqs, offers, flags, reports, payments, change requests
  await db.query(`delete from public.applications where reference_no like 'EPM-%-${DEMO.refMarker}%'`); // cascades documents, flags, events
}

export async function loadSeed(db: Client, data: SeedData): Promise<Record<string, number>> {
  const inserted: Record<string, number> = {};
  for (const table of TABLE_ORDER as readonly SeedTable[]) {
    inserted[table] = await insertMany(db, table, data.tables[table], table === "message_templates" ? { onConflictDoNothing: "key" } : {});
  }
  return inserted;
}
