import live from "./live.js";
import mock from "./mock.js";

// Static imports keep the build target happy (no top-level await). Live is used only when Supabase is configured.
const isLive = Boolean(import.meta.env.VITE_SUPABASE_URL);

export const api = isLive ? live : mock;
export default api;
