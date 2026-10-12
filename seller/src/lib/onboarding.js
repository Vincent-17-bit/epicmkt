const has = (v) => (typeof v === "string" ? v.trim().length > 0 : Array.isArray(v) ? v.length > 0 : v && typeof v === "object" ? Object.keys(v).length > 0 : Boolean(v));

export const ONBOARDING_STEPS = [
  { key: "profile", title: "Profile basics", text: "Add a tagline, a description and a logo so customers know who you are.", to: "/account", cta: "Edit profile" },
  { key: "hours", title: "Opening hours", text: "Tell customers when you are open.", to: "/account", cta: "Set hours" },
  { key: "item", title: "Your first item with a photo", text: "Add something you sell and give it a clear photo.", to: "/catalog", cta: "Add an item" },
  { key: "faqs", title: "Answer a common question", text: "Save time by answering what customers ask most.", to: "/account", cta: "Add a question" },
  { key: "qr", title: "Get your QR poster", text: "Print it so people can scan and open your listing.", to: "/account", cta: "Open the poster" }
];

// Each step ticks from real data. Nothing here is typed in by the seller, except the QR poster,
// which has nothing to inspect, so opening it is recorded once.
export function onboardingProgress({ business, catalog, usage, settings } = {}) {
  const b = business ?? {};
  const itemsWithPhoto = Math.max(0, (catalog?.total ?? 0) - (catalog?.without_photo ?? 0));
  const done = {
    profile: has(b.tagline) && has(b.description) && has(b.logo_path),
    hours: has(b.hours),
    item: itemsWithPhoto > 0,
    faqs: (usage?.faqs ?? 0) > 0,
    qr: Boolean(settings?.onboarding?.qr_seen)
  };
  const steps = ONBOARDING_STEPS.map((s) => ({ ...s, done: done[s.key] }));
  const count = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done) ?? null;
  return { steps, count, total: steps.length, percent: Math.round((count / steps.length) * 100), complete: count === steps.length, next };
}

// Whether to nudge the seller on the dashboard.
export const needsSetup = (progress, settings) => !progress.complete && settings?.onboarding?.status !== "done";
