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

export const TOWNS = [
  { name: "Bungoma", county: "Bungoma", lat: 0.5635, lng: 34.5606 },
  { name: "Busia", county: "Busia", lat: 0.4608, lng: 34.1115 },
  { name: "Eldoret", county: "Uasin Gishu", lat: 0.5143, lng: 35.2698 },
  { name: "Embu", county: "Embu", lat: -0.5389, lng: 37.4596 },
  { name: "Garissa", county: "Garissa", lat: -0.4532, lng: 39.6461 },
  { name: "Homa Bay", county: "Homa Bay", lat: -0.5273, lng: 34.4571 },
  { name: "Kakamega", county: "Kakamega", lat: 0.2827, lng: 34.7519 },
  { name: "Kericho", county: "Kericho", lat: -0.3689, lng: 35.2863 },
  { name: "Kiambu", county: "Kiambu", lat: -1.1714, lng: 36.8356 },
  { name: "Kilifi", county: "Kilifi", lat: -3.6305, lng: 39.8499 },
  { name: "Kisii", county: "Kisii", lat: -0.6817, lng: 34.7667 },
  { name: "Kisumu", county: "Kisumu", lat: -0.0917, lng: 34.768 },
  { name: "Kitale", county: "Trans Nzoia", lat: 1.0157, lng: 35.0062 },
  { name: "Kitui", county: "Kitui", lat: -1.3667, lng: 38.0106 },
  { name: "Machakos", county: "Machakos", lat: -1.5177, lng: 37.2634 },
  { name: "Malindi", county: "Kilifi", lat: -3.2192, lng: 40.1169 },
  { name: "Maseno", county: "Kisumu", lat: -0.0058, lng: 34.6 },
  { name: "Meru", county: "Meru", lat: 0.0467, lng: 37.649 },
  { name: "Migori", county: "Migori", lat: -1.0634, lng: 34.4731 },
  { name: "Mombasa", county: "Mombasa", lat: -4.0435, lng: 39.6682 },
  { name: "Nairobi", county: "Nairobi", lat: -1.2864, lng: 36.8172 },
  { name: "Naivasha", county: "Nakuru", lat: -0.7172, lng: 36.431 },
  { name: "Nakuru", county: "Nakuru", lat: -0.3031, lng: 36.08 },
  { name: "Nanyuki", county: "Laikipia", lat: 0.0069, lng: 37.0722 },
  { name: "Narok", county: "Narok", lat: -1.0783, lng: 35.86 },
  { name: "Nyeri", county: "Nyeri", lat: -0.4201, lng: 36.9476 },
  { name: "Ruiru", county: "Kiambu", lat: -1.1459, lng: 36.961 },
  { name: "Siaya", county: "Siaya", lat: 0.0607, lng: 34.2881 },
  { name: "Thika", county: "Kiambu", lat: -1.0332, lng: 37.0693 },
  { name: "Voi", county: "Taita Taveta", lat: -3.3961, lng: 38.5561 }
];

export const TIMEZONE_OFFSET_HOURS = 3;
