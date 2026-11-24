// /.well-known/ard.json, the agent resource catalogue. No agent-facing tools are published yet, so the list is empty.
import { ardManifest } from "./_lib/meta.js";

export const config = { runtime: "edge" };

export default function handler() {
  return new Response(JSON.stringify(ardManifest()), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, s-maxage=86400" }
  });
}
