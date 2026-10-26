// Reads the public views over PostgREST with the anon key, the same access the browser app has. No service-role key is
// used here: the link-preview and sitemap handlers only ever need what any visitor can already see.

const env = (name) => (typeof process !== "undefined" ? process.env?.[name] : undefined);

export const supabaseUrl = () => String(env("SUPABASE_URL") || env("VITE_SUPABASE_URL") || "").replace(/\/$/, "");
// The Cloudinary cloud pictures are served from. Public by design (it is in every picture url); no key or secret is ever read here.
export const cloudinaryCloud = () => String(env("CLOUDINARY_CLOUD_NAME") || env("VITE_CLOUDINARY_CLOUD_NAME") || "").trim();
const anonKey = () => env("SUPABASE_ANON_KEY") || env("VITE_SUPABASE_ANON_KEY") || "";

export const configured = () => Boolean(supabaseUrl() && anonKey());

export async function rest(path, { timeoutMs = 4000 } = {}) {
  const res = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    headers: { apikey: anonKey(), Authorization: `Bearer ${anonKey()}`, Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) throw new Error(`supabase_${res.status}`);
  return res.json();
}

// Reads every row of a view, one page at a time (PostgREST caps a single response, usually at 1000 rows).
export async function restAll(path, { page = 1000, max = 50000 } = {}) {
  const rows = [];
  for (let offset = 0; offset < max; offset += page) {
    const chunk = await rest(`${path}&limit=${page}&offset=${offset}`, { timeoutMs: 8000 });
    rows.push(...chunk);
    if (chunk.length < page) break;
  }
  return rows;
}

// The address search engines should treat as the site's own: VITE_SITE_URL, else the production domain Vercel reports (it becomes
// your own domain once you add one to the project), else whatever host this request came in on.
const withScheme = (value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`);
export const siteOrigin = (req) => {
  const set = String(env("VITE_SITE_URL") || "").trim() || String(env("VERCEL_PROJECT_PRODUCTION_URL") || "").trim();
  return (set ? withScheme(set) : new URL(req.url).origin).replace(/\/+$/, "");
};

// Calls a Postgres function (RPC) with the anon key. One round trip instead of paging through whole tables.
export async function rpc(name, args = {}, { timeoutMs = 8000 } = {}) {
  const res = await fetch(`${supabaseUrl()}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: anonKey(), Authorization: `Bearer ${anonKey()}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) throw new Error(`supabase_${res.status}`);
  return res.json();
}
