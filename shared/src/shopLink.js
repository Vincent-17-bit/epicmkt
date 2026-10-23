// One place decides what a shop's public link looks like: <site>/s/<slug>.
// The slug is unique per business (database constraint), so no two businesses can ever share a link or a QR code.

export const DEFAULT_SITE_URL = "https://epicmkt.app";
export const SLUG_PATTERN = /^[a-z0-9-]{3,60}$/;

export const isValidSlug = (slug) => typeof slug === "string" && SLUG_PATTERN.test(slug);

export const siteBase = (site) => {
  const raw = typeof site === "string" && site.trim() ? site.trim() : DEFAULT_SITE_URL;
  return raw.replace(/\/+$/, "");
};

const need = (slug) => {
  if (!isValidSlug(slug)) throw new Error("invalid_slug");
  return slug;
};

// The link customers see, share and read aloud.
export const shopUrl = (slug, site) => `${siteBase(site)}/s/${need(slug)}`;

// What the QR code encodes: the public link plus a source tag, nothing else. Never a name, phone or id.
export const shopQrUrl = (slug, site) => `${shopUrl(slug, site)}?src=qr`;

// The same link without the scheme, for printing under a code. epicmkt.app/s/<slug>
export const shopDisplayUrl = (slug, site) => shopUrl(slug, site).replace(/^https?:\/\//, "");

export const whatsappShareUrl = (slug, name, site) => {
  const text = `${name ? `${name} on EpicMKT. ` : ""}See our prices and location: ${shopUrl(slug, site)}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
};
