// Writes categories.item_template for every category, and nothing else.
//   npm run seed:item-templates            applies
//   npm run seed:item-templates -- --dry   shows what would change, writes nothing
// Unlike `npm run seed` this never touches plans, prices, business templates or legal text, so it is safe to run on a
// project where admins have already edited prices. Needs scripts/.env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
import { fileURLToPath } from "node:url";
import { ITEM_TEMPLATES } from "../shared/src/seller/item-templates.js";

// db: a supabase-js client. Returns { updated, missing, failed } so callers (and tests) can see exactly what happened.
export async function applyItemTemplates(db, templates = ITEM_TEMPLATES, { dry = false } = {}) {
  const result = { updated: [], missing: [], failed: [] };
  for (const [id, fields] of Object.entries(templates)) {
    if (dry) {
      const { data, error } = await db.from("categories").select("id").eq("id", id);
      if (error) result.failed.push({ id, message: error.message });
      else if (!data?.length) result.missing.push(id);
      else result.updated.push(id);
      continue;
    }
    const { data, error } = await db.from("categories").update({ item_template: fields }).eq("id", id).select("id");
    if (error) result.failed.push({ id, message: error.message });
    else if (!data?.length) result.missing.push(id);
    else result.updated.push(id);
  }
  return result;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in scripts/.env");
    process.exit(1);
  }
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const dry = process.argv.includes("--dry");
  const r = await applyItemTemplates(db, ITEM_TEMPLATES, { dry });
  console.log(`${dry ? "Would update" : "Updated"} ${r.updated.length} categories.`);
  if (r.missing.length) console.warn(`Not found in the database (skipped): ${r.missing.join(", ")}`);
  if (r.failed.length) {
    for (const f of r.failed) console.error(`Failed ${f.id}: ${f.message}`);
    console.error("If the message mentions item_template, apply migration 0007 first (supabase db push).");
    process.exit(1);
  }
}
