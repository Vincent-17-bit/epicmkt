const isLive = Boolean(import.meta.env.VITE_SUPABASE_URL);

const mod = isLive
  ? await import("./live.js")
  : await import("./mock.js");

export const api = mod.default;
export default api;
