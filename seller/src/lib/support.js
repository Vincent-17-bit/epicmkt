import { formatPhoneKE, telLink, whatsappLink, planLabel, upgradeSummary } from "@epicmkt/shared";

// EpicMKT's own contact details. These are the same variables the public site's /contact page reads
// (client/src/lib/site.js), so one set of values serves both. Read at call time so tests can stub them.
export function supportContact(env = import.meta.env ?? {}) {
  return {
    email: env.VITE_CONTACT_EMAIL || "",
    phone: env.VITE_CONTACT_PHONE || "",
    whatsapp: env.VITE_CONTACT_WHATSAPP || "",
    hours: env.VITE_SUPPORT_HOURS || "",
  };
}

// Real links only: a channel appears only when its detail is configured.
export function supportChannels({ subject = "", message = "" } = {}, env) {
  const c = supportContact(env);
  return [
    c.email && { key: "email", label: "Email EpicMKT", detail: c.email, href: `mailto:${c.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}` },
    c.whatsapp && { key: "whatsapp", label: "WhatsApp EpicMKT", detail: formatPhoneKE(c.whatsapp), href: whatsappLink(c.whatsapp, message), external: true },
    c.phone && { key: "phone", label: "Call EpicMKT", detail: formatPhoneKE(c.phone), href: telLink(c.phone) },
  ].filter(Boolean);
}

// The message that goes with an upgrade request, so the team knows who is asking and for what.
export function upgradeRequest({ business, plan }) {
  const s = upgradeSummary(plan);
  if (!s) return null;
  const who = `${business.name}${business.sellerId ? ` (Seller ID ${business.sellerId})` : ""}`;
  return {
    subject: `Upgrade request: ${business.name} to ${planLabel(s.to.key)}`,
    message: `Hello EpicMKT, I would like to upgrade ${who} from ${planLabel(s.from.key)} to ${planLabel(s.to.key)}. Please let me know the next steps.`,
  };
}
