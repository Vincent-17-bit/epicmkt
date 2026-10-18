const notConfigured = () => {
  throw new Error("Live data for this page is not connected yet. You are signed in; the queries for this page have not been built.");
};

export const listBusinesses = notConfigured;
export const listAllBusinesses = notConfigured;
export const getBusinessTabCounts = notConfigured;
export const getBusinessFilterOptions = notConfigured;
export const bulkBusinessAction = notConfigured;
export const undoBulkBusinessAction = notConfigured;
export const listAuditEntries = notConfigured;

export const liveAdminApi = {
  async getAdminCounts() {
    throw new Error("Live data for this page is not connected yet. You are signed in; the queries for this page have not been built.");
  },
  async getApplications() {
    throw new Error("Live data for this page is not connected yet. You are signed in; the queries for this page have not been built.");
  },
  async getBusinesses() {
    throw new Error("Live data for this page is not connected yet. You are signed in; the queries for this page have not been built.");
  },
  async getPayments() {
    throw new Error("Live data for this page is not connected yet. You are signed in; the queries for this page have not been built.");
  },
};

export default liveAdminApi;
