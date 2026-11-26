// Opening a business's seller site from the admin app.

// Where the seller site lives. Set VITE_SELLER_URL where the admin app is built. Without it the address is worked out from this one:
// epicmkt-admin.example.com -> epicmkt-seller.example.com, and a local admin app finds the seller app on its usual local port.
export function sellerSiteBase(env = import.meta.env, here = globalThis.location) {
  const set = String(env?.VITE_SELLER_URL ?? "").trim().replace(/\/+$/, "");
  if (set) return set;
  const host = here?.hostname ?? "";
  if (/admin/i.test(host)) return `${here.protocol}//${host.replace(/admin/i, "seller")}${here.port ? `:${here.port}` : ""}`;
  // Only a local admin app may guess the local seller port. On a real host with no hint, a wrong guess would open a dead page.
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(host)) return "http://localhost:5174";
  return "";
}

// The sign-in token travels in the part of the address after #, which a browser never sends to any server and the seller site removes at once.
export function sellerSiteLink({ base, tokenHash, businessName = "", sellerId = "", adminUrl = "" }) {
  const q = new URLSearchParams({ token_hash: tokenHash, business: businessName, seller: sellerId });
  if (adminUrl) q.set("admin", adminUrl);
  return `${base}/admin-access#${q.toString()}`;
}
