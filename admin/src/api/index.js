const isLive = Boolean(import.meta.env.VITE_SUPABASE_URL);

export const api = isLive
  ? await import("./live.js")
  : await import("./mock.js");

export default api;
export { api as default };
