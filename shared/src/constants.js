export const PLANS = { STANDARD: "standard", PREMIUM: "premium" };

export const PLAN_PRICE_KES = { standard: 500, premium: 1500 };

export const PLAN_FEATURES = {
  standard: { label: "Standard", maxGallery: 3, socials: false, featured: false, priorityRanking: false },
  premium: { label: "Premium", maxGallery: 12, socials: true, featured: true, priorityRanking: true }
};

export const BUSINESS_STATUS = { ACTIVE: "active", PENDING: "pending", SUSPENDED: "suspended" };

export const EVENT_TYPES = ["view", "call", "whatsapp", "directions"];

export const REPORT_REASONS = [
  { value: "wrong-info", label: "Wrong or outdated information" },
  { value: "closed", label: "Business has closed or moved" },
  { value: "wrong-contact", label: "Phone or WhatsApp does not work" },
  { value: "scam", label: "Scam or misleading" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "other", label: "Something else" }
];

export const SORTS = ["relevance", "distance", "rating", "newest", "price_asc", "price_desc"];

export const COUNTIES = [
  "Nairobi",
  "Mombasa",
  "Kisumu",
  "Nakuru",
  "Uasin Gishu",
  "Kakamega",
  "Kisii",
  "Kiambu",
  "Machakos",
  "Nyeri"
];

export const TIMEZONE_OFFSET_HOURS = 3;
