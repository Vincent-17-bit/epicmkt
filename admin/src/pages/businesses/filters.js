export const emptyFilters = {
  category: "",
  county: "",
  town: "",
  plan: "",
  verified: "",
  featured: "",
  status: "",
  daysMin: "",
  daysMax: "",
  hasFlags: false,
  hasUnconfirmed: false,
  agent: "",
  createdFrom: "",
  createdTo: "",
};

export const countFilters = (filters) => Object.keys(emptyFilters).filter((key) => filters[key] !== emptyFilters[key]).length;

export const TABS = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "expiring", label: "Expiring soon" },
  { id: "grace", label: "In grace" },
  { id: "expired", label: "Expired" },
  { id: "paused", label: "Paused" },
  { id: "suspended", label: "Suspended" },
  { id: "unlisted", label: "Unlisted" },
  { id: "flagged", label: "Flagged" },
  { id: "deleted", label: "Deleted" },
];
