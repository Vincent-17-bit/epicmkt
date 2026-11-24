// An EpicMKT admin opening this seller site as one business (from the admin app's "Open seller site").
// The admin's link carries a one-time sign-in token after the # (never sent to any server). This page exchanges it for a normal session for that one
// business, and remembers for this tab only that an admin is here, so the banner and the Close button show.

const KEY = "epicmkt.adminAccess";

// "#token_hash=...&business=Sunrise%20Bakery&seller=SLR-1&admin=https%3A%2F%2Fadmin.example.com" -> { tokenHash, business, seller, admin }
export function parseAdminHash(hash) {
  const q = new URLSearchParams(String(hash ?? "").replace(/^#/, ""));
  const tokenHash = (q.get("token_hash") ?? "").trim();
  if (!tokenHash) return null;
  return { tokenHash, business: (q.get("business") ?? "").trim().slice(0, 120), seller: (q.get("seller") ?? "").trim().slice(0, 40), admin: safeOrigin(q.get("admin")) };
}

// Only a plain http(s) origin is ever used as the place to go back to.
export function safeOrigin(value) {
  try {
    const u = new URL(String(value ?? ""));
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : "";
  } catch {
    return "";
  }
}

export const getAdminAccess = () => {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === "object" ? { business: String(v.business ?? ""), seller: String(v.seller ?? ""), admin: safeOrigin(v.admin) } : null;
  } catch {
    return null;
  }
};
export const setAdminAccess = ({ business = "", seller = "", admin = "" }) => {
  try { window.sessionStorage.setItem(KEY, JSON.stringify({ business, seller, admin: safeOrigin(admin) })); } catch { /* a private tab can refuse storage: the banner is then missing, the session still works */ }
};
export const clearAdminAccess = () => {
  try { window.sessionStorage.removeItem(KEY); } catch { /* nothing to clear */ }
};

// The admin app's Businesses list, where Close goes when the tab cannot close itself.
export const adminBusinessesUrl = (admin) => (admin ? `${admin}/admin/businesses` : "");
