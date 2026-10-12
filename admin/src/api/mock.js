const mockCounts = {
  brief: "4 applications are waiting, 2 payments need confirming and 6 sellers expire this week",
  liveBusinesses: 142,
  applicationsWaiting: 14,
  unconfirmedPayments: 3,
  expiringSoon: 6,
};

const mockApplications = [
  { reference: "APP-2049", businessName: "Mara Fresh Mart", ownerName: "Alice Njeri", status: "Submitted", submittedAt: "Today, 09:12" },
  { reference: "APP-2050", businessName: "Umoja Hardware", ownerName: "John Ouma", status: "Under review", submittedAt: "Today, 11:40" },
  { reference: "APP-2051", businessName: "Green Valley Foods", ownerName: "Mary Wambui", status: "Needs changes", submittedAt: "Yesterday" },
];

const mockBusinesses = [
  { name: "Mara Fresh Mart", town: "Nairobi", plan: "Premium", status: "Live", paidUntil: "2026-11-18" },
  { name: "Umoja Hardware", town: "Kisumu", plan: "Standard", status: "Live", paidUntil: "2026-11-02" },
  { name: "Green Valley Foods", town: "Mombasa", plan: "Premium", status: "Expiring soon", paidUntil: "2026-10-15" },
];

const mockPayments = [
  { receipt: "RCP-1024", businessName: "Mara Fresh Mart", amount: 3200, status: "Confirmed", mpesaCode: "MPESA-4411" },
  { receipt: "RCP-1025", businessName: "Umoja Hardware", amount: 2500, status: "Pending", mpesaCode: "MPESA-4412" },
  { receipt: "RCP-1026", businessName: "Green Valley Foods", amount: 4500, status: "Rejected", mpesaCode: "MPESA-4413" },
];

export const mockAdminApi = {
  async getAdminCounts() {
    return mockCounts;
  },
  async getApplications() {
    return mockApplications;
  },
  async getBusinesses() {
    return mockBusinesses;
  },
  async getPayments() {
    return mockPayments;
  },
};
