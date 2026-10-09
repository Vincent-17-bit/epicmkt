const has = (v) => typeof v === "string" ? v.trim().length > 0 : Array.isArray(v) ? v.length > 0 : v && typeof v === "object" ? Object.keys(v).length > 0 : Boolean(v);

export function businessReadiness(business, { catalog, usage } = {}) {
  const b = business ?? {};
  const premium = b.plan_key === "premium";
  const total = catalog?.total ?? 0;
  const blocking = [
    { key: "phone", label: "Add a phone number", done: has(b.phone), to: "/account" },
    { key: "location", label: "Set your location", done: has(b.town) && b.lat != null && b.lng != null, to: "/account" },
    { key: "hours", label: "Set your opening hours", done: has(b.hours), to: "/account" },
    { key: "item", label: "Add your first item", done: total > 0, to: "/catalog" }
  ];
  const recommended = [
    { key: "logo", label: "Upload a logo", done: has(b.logo_path), to: "/account" },
    { key: "cover", label: "Upload a cover photo", done: has(b.cover_path), to: "/account" },
    { key: "tagline", label: "Write a tagline", done: has(b.tagline), to: "/account" },
    { key: "description", label: "Write a description", done: has(b.description), to: "/account" },
    { key: "whatsapp", label: "Add a WhatsApp number", done: has(b.whatsapp), to: "/account" },
    { key: "payments", label: "List payment methods", done: has(b.payment_methods), to: "/account" },
    { key: "photos", label: "Add a photo to every item", done: total > 0 && (catalog?.without_photo ?? 0) === 0, to: "/catalog" },
    { key: "faq", label: "Answer a common question", done: (usage?.faqs ?? 0) > 0, to: "/account" }
  ];
  if (premium) recommended.push({ key: "socials", label: "Link your social pages", done: has(b.socials), to: "/account" });
  const weight = (list, w) => list.length * w;
  const earned = blocking.filter((x) => x.done).length * 3 + recommended.filter((x) => x.done).length;
  const max = weight(blocking, 3) + weight(recommended, 1);
  return {
    score: Math.round((earned / max) * 100),
    blocking: blocking.filter((x) => !x.done),
    recommended: recommended.filter((x) => !x.done),
    blockingAll: blocking,
    recommendedAll: recommended
  };
}
