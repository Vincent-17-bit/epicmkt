// npm run migrate:images -- [--dry-run] [--limit=100] [--delete-old]
// Reads scripts/.env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLOUDINARY_URL (or CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET).
import { createClient } from "@supabase/supabase-js";
import { migrateImages } from "./lib/migrate-images.mjs";

const arg = (name) => process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
let cloud = null;
const u = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec((process.env.CLOUDINARY_URL ?? "").trim());
if (u) cloud = { apiKey: u[1], apiSecret: u[2], cloudName: u[3] };
else if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloud = { cloudName: process.env.CLOUDINARY_CLOUD_NAME, apiKey: process.env.CLOUDINARY_API_KEY, apiSecret: process.env.CLOUDINARY_API_SECRET };
}
if (!url || !key || !cloud) {
  console.error("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and CLOUDINARY_URL in scripts/.env");
  process.exit(1);
}
cloud.aiUpscale = (process.env.CLOUDINARY_AI_UPSCALE ?? "").toLowerCase() === "true";

const limit = Number((arg("limit") ?? "").split("=")[1]) || Infinity;
const db = createClient(url, key, { auth: { persistSession: false } });
const stats = await migrateImages({ db, cloud, supabaseUrl: url, dryRun: Boolean(arg("dry-run")), limit, deleteOld: Boolean(arg("delete-old")) });
console.log(JSON.stringify(stats));
process.exit(stats.failed ? 1 : 0);
