// /robots.txt, generated so the Sitemap line carries this deployment's real origin.
import { robotsTxt } from "./_lib/meta.js";
import { siteOrigin } from "./_lib/supabase.js";

export const config = { runtime: "edge" };

export default function handler(req) {
  return new Response(robotsTxt(siteOrigin(req)), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, s-maxage=86400" }
  });
}
