export const liveAdminApi = {
  async getAdminCounts() {
    throw new Error("Supabase admin API not configured. Set VITE_SUPABASE_URL to enable live data.");
  },
  async getApplications() {
    throw new Error("Supabase admin API not configured. Set VITE_SUPABASE_URL to enable live data.");
  },
  async getBusinesses() {
    throw new Error("Supabase admin API not configured. Set VITE_SUPABASE_URL to enable live data.");
  },
  async getPayments() {
    throw new Error("Supabase admin API not configured. Set VITE_SUPABASE_URL to enable live data.");
  },
};

export default liveAdminApi;
