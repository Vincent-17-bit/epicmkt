// Admin detection for the public client. Kept out of the main bundle: only AdminQuickBar imports this file.
import { createClient } from "@supabase/supabase-js";

let client = null;
let cached = null;

// The public client elsewhere runs with persistSession:false, so this one reads the stored session itself and never refreshes or writes it.
function adminClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key, { auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } });
  return client;
}

// rpc is_admin, asked once per page load and cached. Any failure counts as "not an admin".
export function isAdmin() {
  cached ??= (async () => {
    const db = adminClient();
    if (!db) return false;
    try {
      const { data: session } = await db.auth.getSession();
      if (!session?.session) return false;
      const { data, error } = await db.rpc("is_admin");
      return !error && data === true;
    } catch {
      return false;
    }
  })();
  return cached;
}

const ADMIN_URL = (import.meta.env.VITE_ADMIN_URL || "/admin-app").replace(/\/$/, "");

export function adminLink(path, peek) {
  const query = peek ? `?peek=${encodeURIComponent(`${peek.type}:${peek.id}`)}` : "";
  return `${ADMIN_URL}${path}${query}`;
}
