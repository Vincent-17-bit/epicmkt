// One-off: give items that have no product type one, where their name makes it clear. Dry run unless --apply.
//
//   node --env-file=scripts/.env scripts/backfill-product-types.mjs                    prints the report, writes the review list, changes nothing
//   node --env-file=scripts/.env scripts/backfill-product-types.mjs --apply            sets the types it is sure of
//   --review-file=path     where the review list goes (default scripts/backfill-review.csv)
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Safe to run twice: a type is only written where the item still has none, and a type a
// seller chose is never replaced. Items it is not sure of are listed for an admin (the CSV), never guessed.
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { formatReport, reviewCsv, runBackfill } from "./lib/backfill-types.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const reviewFile = args.find((a) => a.startsWith("--review-file="))?.slice("--review-file=".length) ?? "scripts/backfill-review.csv";
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (scripts/.env).");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

const PAGE = 1000;
const adapter = {
  async loadItems() {
    const shops = new Map(must(await db.from("businesses").select("id, category_id")).map((b) => [b.id, b.category_id]));
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const page = must(await db.from("items").select("id, name, business_id, product_type_id").is("product_type_id", null).order("id").range(from, from + PAGE - 1));
      rows.push(...page);
      if (page.length < PAGE) break;
    }
    return rows.map((r) => ({ id: r.id, name: r.name, businessId: r.business_id, categoryId: shops.get(r.business_id) ?? "", productTypeId: r.product_type_id }));
  },
  async loadTypes() {
    return must(await db.from("product_types").select("id, name, category_ids, restricted_to").eq("active", true)).map((t) => ({ id: t.id, name: t.name, categoryIds: t.category_ids ?? [], restrictedTo: t.restricted_to ?? [] }));
  },
  async assign(itemId, typeId) {
    // Only where the type is still empty: a seller who picked one since we read keeps theirs.
    const { data, error } = await db.from("items").update({ product_type_id: typeId }).eq("id", itemId).is("product_type_id", null).select("id");
    if (error) throw new Error(`${itemId}: ${error.message}`);
    return data.length > 0;
  },
};

const report = await runBackfill(adapter, { apply });
writeFileSync(reviewFile, reviewCsv(report.review));
console.log(formatReport(report));
console.log(`\nReview list: ${reviewFile} (${report.review.length} items)`);
