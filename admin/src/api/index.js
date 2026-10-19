// Production builds are always live (see lib/supabaseClient.js); mock data is for local development only.
const isLive = Boolean(import.meta.env.VITE_SUPABASE_URL) || import.meta.env.PROD;

export const api = isLive
  ? await import("./live.js")
  : await import("./mock.js");

export default api;
