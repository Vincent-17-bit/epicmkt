import liveAdminApi from "./live.js";
import { mockAdminApi } from "./mock.js";

const isLive = Boolean(import.meta.env.VITE_SUPABASE_URL);

// The pages call api.getApplications() etc., so export the API object itself.
export const api = isLive ? liveAdminApi : mockAdminApi;

export default api;
