export const DEFAULT_SITE_URL = "https://epicmkt.co.ke";

const clean = (base) => String(base || DEFAULT_SITE_URL).replace(/\/+$/, "");

export const shopUrl = (base, slug) => `${clean(base)}/s/${encodeURIComponent(slug)}`;

export const qrUrl = (base, slug) => `${shopUrl(base, slug)}?src=qr`;

export const displayUrl = (base, slug) => shopUrl(base, slug).replace(/^https?:\/\//, "");

export const CAPTION_MAX = 300;

export const defaultCaption = (name, link) =>
  `Visit ${name} on EpicMKT to explore our prices, offers and location: ${link}`;

export const withLink = (caption, link) => {
  const text = String(caption ?? "").trim().slice(0, CAPTION_MAX);
  return text.includes(link) ? text : `${text}${text ? " " : ""}${link}`;
};

export const whatsappUrl = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;

export const smsUrl = (text) => `sms:?body=${encodeURIComponent(text)}`;

export const mailUrl = (subject, text) => `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;

export const POSTER_SIZES = {
  A4: { mm: [210, 297], px: [2480, 3508] },
  A5: { mm: [148, 210], px: [1748, 2480] },
};

export const POSTER_TAGLINE = "Scan to see our prices and location";
