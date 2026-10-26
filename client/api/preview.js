// Link previews for /b/:slug and /b/:slug/i/:itemId (also /b/:slug?item=:id, the form flash-sale links use).
//
// The app is a client-rendered SPA, so WhatsApp, Facebook, X, Telegram and most crawlers, which do not run JavaScript, only
// ever saw the generic shell. vercel.json routes these two paths here. The handler fetches the built index.html, puts this
// page's title, description, share image and JSON-LD into its head and returns it. Everyone gets the same page, the app
// boots as before. The head is only filled in for the crawlers' sake.
//
// If Supabase is unreachable the untouched shell is returned, so a failure here can never break a page that worked before.
// (This cannot be a Supabase edge function: on the default domain those return HTML as text/plain, which crawlers ignore.)

import { categories } from "../src/data/categories.js";
import { buildMeta, injectHead, isUuid, notFoundMeta } from "./_lib/meta.js";
import { cloudinaryCloud, configured, rest, siteOrigin, supabaseUrl } from "./_lib/supabase.js";

export const config = { runtime: "edge" };

const BUSINESS = "id,slug,name,category_id,tagline,description,phone,socials,county,town,address,lat,lng,logo_path,cover_path";
const ITEM = "id,business_id,name,description,price,price_max,price_type,availability,image_paths";

const html = (body, status, cache) =>
  new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": cache } });

export default async function handler(req) {
  const url = new URL(req.url);
  const origin = siteOrigin(req);
  const slug = (url.searchParams.get("slug") ?? "").trim();
  const itemId = (url.searchParams.get("item") ?? "").trim();

  // /index.html is a real file, and Vercel serves files before rewrites, so this is the built shell and not this function.
  const shellRes = await fetch(new URL("/index.html", url.origin)).catch(() => null);
  if (!shellRes?.ok) return new Response("Temporarily unavailable", { status: 502, headers: { "Cache-Control": "no-store" } });
  const shell = await shellRes.text();

  if (!configured() || !slug) return html(shell, 200, "public, s-maxage=60");

  try {
    const [business] = await rest(`public_businesses?select=${BUSINESS}&slug=eq.${encodeURIComponent(slug)}&limit=1`);
    if (!business) return html(injectHead(shell, notFoundMeta({ origin })), 404, "public, s-maxage=60");

    let item = null;
    if (isUuid(itemId)) {
      [item] = await rest(`public_items?select=${ITEM}&id=eq.${itemId}&business_id=eq.${business.id}&limit=1`);
      // A removed or unknown item still gets the store's own preview, as the app itself shows the store in that case.
    }
    const categoryName = categories.find((c) => c.id === business.category_id)?.name ?? "";
    const page = injectHead(shell, buildMeta({ origin, supabaseUrl: supabaseUrl(), cloudName: cloudinaryCloud(), business, item, categoryName }));
    return html(page, 200, "public, s-maxage=300, stale-while-revalidate=86400");
  } catch {
    return html(shell, 200, "no-store");
  }
}
