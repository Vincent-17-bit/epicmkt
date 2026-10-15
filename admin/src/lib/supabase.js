import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** True when the app talks to a real Supabase project. Otherwise it runs on built-in mock data. */
export const isLive = Boolean(url && anonKey);

/** The anon key is public by design. The service role key never reaches the browser. */
export const supabase = isLive
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "epicmkt-admin-auth" },
    })
  : null;
