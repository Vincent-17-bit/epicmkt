export const ONBOARDING_STEPS = [
  { key: "logo", title: "Add your logo", text: "A logo helps customers recognise your shop in search and on your listing.", to: "/business/account", cta: "Add a logo" },
  { key: "signin", title: "Set up your sign-in", text: "Add a verified email and choose your own password, so you can always get back in.", to: "/business/account", cta: "Open Account" },
  { key: "item", title: "Your first item with a photo", text: "Add something you sell and give it a clear photo.", to: "/business/catalog", cta: "Add an item" },
  { key: "qr", title: "Get your QR poster", text: "Print it so people can scan and open your listing.", to: "/business/qr", cta: "Open the poster" }
];

// Each step ticks from real data. Nothing here is typed in by the seller, except the QR poster,
// which has nothing to inspect, so opening it is recorded once.
// `business` is the camelCase business from getSubscription; `catalog` is the result of catalogStats.
export function onboardingProgress({ business, catalog, settings } = {}) {
  const b = business ?? {};
  const itemsWithPhoto = Math.max(0, (catalog?.total ?? 0) - (catalog?.without_photo ?? 0));
  const done = {
    logo: Boolean(b.logoPath),
    signin: Boolean(b.loginEmailVerified) && !b.mustChangePassword,
    item: itemsWithPhoto > 0,
    qr: Boolean(settings?.onboarding?.qr_seen)
  };
  const steps = ONBOARDING_STEPS.map((s) => ({ ...s, done: done[s.key] }));
  const count = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done) ?? null;
  return { steps, count, total: steps.length, percent: Math.round((count / steps.length) * 100), complete: count === steps.length, next };
}

// Whether to nudge the seller on the home page.
export const needsSetup = (progress, settings) => !progress.complete && settings?.onboarding?.status !== "done";
