// /sitemap.xml, built from the public views so it always lists the stores and items that are visible right now.
import { categories } from "../src/data/categories.js";
import { buildSitemap } from "./_lib/meta.js";
import { configured, restAll, siteOrigin } from "./_lib/supabase.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  const origin = siteOrigin(req);
  let businesses = [];
  let items = [];
  if (configured()) {
    try {
      [businesses, items] = await Promise.all([
        restAll("public_businesses?select=id,slug,created_at&order=id"),
        restAll("public_items?select=id,business_id,created_at&order=id")
      ]);
    } catch {
      // Serve the static pages rather than an error: a crawler that gets a 500 drops the sitemap for days.
    }
  }
  const xml = buildSitemap({ origin, businesses, items, categoryIds: categories.map((c) => c.id) });
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" }
  });
}
