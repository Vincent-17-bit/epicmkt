import { createClient } from "@supabase/supabase-js";

const url = import.meta.env?.VITE_SUPABASE_URL;
const key = import.meta.env?.VITE_SUPABASE_ANON_KEY;

// A request that never answers would leave the page on "Loading" forever. Data and auth calls give up after this long,
// so the page shows its normal "could not load" message instead. Storage uploads, edge functions and realtime are left alone.
export const REQUEST_TIMEOUT_MS = 30_000;
const TIMED = /\/(rest|auth)\/v1\//;

export const timedFetch = (input, init = {}) => {
  const target = typeof input === "string" ? input : input?.url ?? String(input);
  if (!TIMED.test(target) || typeof AbortSignal?.timeout !== "function" || typeof AbortSignal?.any !== "function") return fetch(input, init);
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
};

export const supabase = url && key
  // db.retry is off because the data client retries a rejected GET up to 3 times, which would turn one 30 second timeout into minutes of "Loading".
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true }, db: { retry: false }, global: { fetch: timedFetch } })
  : null;
