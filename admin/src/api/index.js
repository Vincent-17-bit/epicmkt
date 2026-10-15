const isLive = Boolean(import.meta.env.VITE_SUPABASE_URL);

const mod = isLive ? await import("./live.js") : await import("./mock.js");

// Both modules default-export the same function bag, so pages call api.getBusinesses(), api.adminSearch(), ...
export const api = mod.default;
export default api;
