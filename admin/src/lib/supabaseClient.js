import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Same rule as src/api/index.js: no URL means the admin runs on built-in demo data.
export const isLive = Boolean(url);

// A URL without the anon key cannot sign anyone in. Say so on the login page instead of crashing.
export const configError = isLive && !anonKey
  ? "VITE_SUPABASE_ANON_KEY is missing. Set it next to VITE_SUPABASE_URL and redeploy."
  : null;

// Only the public URL and anon key belong here. The service role key must never reach the browser.
export const supabase = isLive && anonKey
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: "epicmkt-admin-auth",
      },
    })
  : null;
