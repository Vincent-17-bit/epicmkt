const isLive = Boolean(import.meta.env.VITE_SUPABASE_URL);

// Same switch as api/index.js: live when Supabase is configured, otherwise the in-memory mock.
export const plansApi = isLive ? await import("./livePlans.js") : await import("./mockPlans.js");
export default plansApi;
