import mockApi from "./mock.js";
import liveApi from "./live.js";

const isLive = Boolean(import.meta.env.VITE_SUPABASE_URL);

export const api = isLive ? liveApi : mockApi;

export default api;
