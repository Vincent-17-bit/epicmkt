import { formatKes } from "../utils.js";
import { shopUrl } from "../shopLink.js";

export const MESSAGE_ITEMS = 8;
export const MESSAGE_LIMIT = 1400;
export const PDF_MAX_ITEMS = 150;
export const NAME_MAX = 60;

const isNumber = (n) => typeof n === "number" && Number.isFinite(n);
const flat = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

/** Item text for a chat message: no line breaks, none of the characters WhatsApp turns into bold or italics, and not too long. */
export const chatSafe = (text, max = NAME_MAX) => {
  const clean = flat(text).replace(/[*_~`]/g, "");
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
};

/** The price as a customer reads it: "KES 1,200", "From KES 500", "KES 300 to KES 900", "Free", "Contact for price". A sale shows the sale price. */
export function sharePrice(item) {
  if (item?.priceType === "free") return "Free";
  if (!isNumber(item?.price) || !["fixed", "from", "range"].includes(item.priceType)) return "Contact for price";
  const now = isNumber(item.salePrice) && item.salePrice >= 0 && item.salePrice < item.price ? item.salePrice : item.price;
  if (item.priceType === "from") return `From ${formatKes(now)}`;
  if (item.priceType === "range") return `${formatKes(now)} to ${formatKes(isNumber(item.priceMax) && item.priceMax >= now ? item.priceMax : now)}`;
  return formatKes(now);
}

/** What the share can include: items showing to customers (not drafts, hidden or removed). Sold-out items only when asked for.
 *  `sections`: only these (use "" for items with no section); empty means all. `ids`: only these items. */
export function shareableItems(items, { sections = [], ids = null, includeSoldOut = false } = {}) {
  const want = new Set(sections);
  const only = ids ? new Set(ids) : null;
  return (Array.isArray(items) ? items : []).filter((i) => {
    if (!i || i.visibility !== "showing" || i.removed) return false;
    if (!includeSoldOut && i.soldOut) return false;
    if (only && !only.has(i.id)) return false;
    if (want.size && !want.has(i.section ?? "")) return false;
    return true;
  });
}

/** The sections of these items, with how many items each has, in name order; items with no section come last as "". */
export function sectionCounts(items) {
  const counts = new Map();
  for (const i of items) counts.set(i.section ?? "", (counts.get(i.section ?? "") ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => (a.name === "") - (b.name === "") || a.name.localeCompare(b.name));
}

/** Items grouped for a printed catalogue: one group per section, in name order, "" (no section) last, items keep their order. */
export function groupBySection(items) {
  const order = sectionCounts(items).map((s) => s.name);
  return order.map((name) => ({ title: name, items: items.filter((i) => (i.section ?? "") === name) }));
}

/** The WhatsApp message: shop name, a short list of items with prices, and the shop link (which shows a preview card with photos).
 *  The list is cut so the whole message stays short enough to send, with "and N more" for the rest. */
export function catalogueMessage({ name, slug, items, prices = true, site, limit = MESSAGE_ITEMS }) {
  const link = shopUrl(slug, site);
  const shop = chatSafe(name, 80);
  const build = (count) => {
    const lines = items.slice(0, count).map((i) => `• ${chatSafe(i.name)}${prices ? ` - ${sharePrice(i)}` : ""}`);
    const more = items.length - count;
    return [
      shop ? `*${shop}* on EpicMKT` : "Our shop on EpicMKT",
      "",
      ...(lines.length ? [`${items.length === 1 ? "What we have:" : "Some of what we have:"}`, ...lines, ...(more > 0 ? [`and ${more} more`] : []), ""] : []),
      "See everything with photos:",
      link
    ].join("\n");
  };
  let count = Math.min(items.length, Math.max(0, limit));
  let text = build(count);
  while (text.length > MESSAGE_LIMIT && count > 0) text = build((count -= 1));
  return text;
}

export const catalogueWhatsappUrl = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;

export const catalogueFileName = (slug, date = new Date()) => `${slug || "catalogue"}-catalogue-${date.toISOString().slice(0, 10)}.pdf`;

/** Text the PDF's built-in font can print: smart quotes and dashes become plain ones, anything outside Latin-1 (emoji, other scripts) is dropped. */
export function pdfSafe(text) {
  return flat(text)
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[   ]/g, " ")
    .replace(/[^ -~¡-ÿ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
