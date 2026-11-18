// /sitemap.xml, built from the public views so it always lists the stores and items that are visible right now.
import { categories } from "../src/data/categories.js";
import { buildSitemap } from "./_lib/meta.js";
import { configured, restAll, siteOrigin } from "./_lib/supabase.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  const origin = siteOrigin(req);
  let businesses = [];
  let items = [];
  // The category pages the admin has switched on (the same list the site shows); the built-in list only when the database is not set up.
  let categoryIds = categories.map((c) => c.id);
  if (configured()) {
    try {
      const [b, i, cats] = await Promise.all([
        restAll("public_businesses?select=id,slug,created_at&order=id"),
        restAll("public_items?select=id,business_id,created_at&order=id"),
        restAll("categories?select=id&active=eq.true&order=sort")
      ]);
      businesses = b;
      items = i;
      if (cats.length) categoryIds = cats.map((c) => c.id);
    } catch {
      // Serve the static pages rather than an error: a crawler that gets a 500 drops the sitemap for days.
    }
  }
  const xml = buildSitemap({ origin, businesses, items, categoryIds });
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" }
  });
}
