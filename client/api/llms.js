// /llms.txt, generated so every link carries this deployment's real origin.
import { llmsTxt } from "./_lib/meta.js";
import { siteOrigin } from "./_lib/supabase.js";

export const config = { runtime: "edge" };

export default function handler(req) {
  return new Response(llmsTxt(siteOrigin(req)), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, s-maxage=86400" }
  });
}
