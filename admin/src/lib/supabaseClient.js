import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// A production build is always live: it never falls back to demo data. Demo data exists only for local
// development (npm run dev) when no Supabase URL is set. Same rule as src/api/index.js.
export const isLive = Boolean(url) || import.meta.env.PROD;

// A missing URL or anon key cannot sign anyone in. Say so on the login page instead of crashing or showing demo data.
export const configError = !isLive ? null
  : !url ? "VITE_SUPABASE_URL is missing. Set it in the host's environment variables and redeploy."
  : !anonKey ? "VITE_SUPABASE_ANON_KEY is missing. Set it next to VITE_SUPABASE_URL and redeploy."
  : null;

// Only the public URL and anon key belong here. The service role key must never reach the browser.
export const supabase = url && anonKey
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: "epicmkt-admin-auth",
      },
    })
  : null;
