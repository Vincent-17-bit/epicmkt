// /api/geocode: area names for the location sheet. ?q=kilimani finds Kenyan areas; ?lat=..&lng=.. names the area a position is in.
// Only a text or a position rounded to about 11 m goes upstream (OpenStreetMap's Photon and Nominatim, or your own: GEOCODE_SEARCH_URL,
// GEOCODE_REVERSE_URL), with our own User-Agent and nothing from the visitor. Answers are cached by the CDN for a day, so a busy area costs
// one lookup. No key is needed.

import { parseRequest, placeFromReverse, placesFromSearch, reverseUrl, searchUrl } from "./_lib/geocode.js";

export const config = { runtime: "edge" };

const env = (name) => (typeof process !== "undefined" ? process.env?.[name] : undefined);
const SEARCH_BASE = () => env("GEOCODE_SEARCH_URL") || "https://photon.komoot.io";
const REVERSE_BASE = () => env("GEOCODE_REVERSE_URL") || "https://nominatim.openstreetmap.org";
const agent = () => `EpicMKT/1.0 (${env("GEOCODE_CONTACT") || "https://epicmkt.app"})`;

const json = (body, status, cache) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": cache } });

const OK = "public, s-maxage=86400, stale-while-revalidate=604800";
const NONE = "no-store";

export default async function handler(req) {
  if (req.method !== "GET") return json({ results: [], error: "method" }, 405, NONE);
  const ask = parseRequest(new URL(req.url).searchParams);
  if (ask.error) return json({ results: [], error: ask.error }, 400, NONE);
  try {
    const url = ask.op === "search" ? searchUrl(SEARCH_BASE(), ask.q, ask.near) : reverseUrl(REVERSE_BASE(), ask.lat, ask.lng);
    const res = await fetch(url, { headers: { "User-Agent": agent(), Accept: "application/json", "Accept-Language": "en" }, signal: AbortSignal.timeout(3500) });
    if (!res.ok) return json({ results: [], error: "upstream" }, 502, NONE);
    const body = await res.json();
    if (ask.op === "search") return json({ results: placesFromSearch(body) }, 200, OK);
    const place = placeFromReverse(body);
    return json({ results: place ? [{ ...place, lat: ask.lat, lng: ask.lng }] : [] }, 200, place ? OK : "public, s-maxage=3600");
  } catch {
    return json({ results: [], error: "upstream" }, 502, NONE);
  }
}
