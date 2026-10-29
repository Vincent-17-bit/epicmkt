// Pure helpers for link previews and the sitemap. No network, no framework: the edge handlers in ../preview.js and
// ../sitemap.js do the fetching and call these. Kept apart so they can be unit tested.

import { imageUrl } from "../../../shared/src/seller/images.js";

export const BRAND = "EpicMKT";
export const DEFAULT_DESCRIPTION =
  "Find barbershops, water refill points, chemists, agrovets, gyms and more near you in Kenya. Call, WhatsApp or get directions.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value) => UUID.test(String(value ?? ""));

export const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const squash = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

export function clip(text, max = 160) {
  const clean = squash(text);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[,;:.\s]+$/, "")}…`;
}

export const kes = (amount) => `KES ${Number(amount).toLocaleString("en-KE")}`;

// Link previews (WhatsApp, Facebook, Google) show a picture of roughly this width, so ask Cloudinary for exactly that instead of the 4K master.
const PREVIEW_WIDTH = 1200;

// A stored picture as an absolute url: Cloudinary for new pictures, the Supabase bucket for older ones (see shared/src/seller/images.js).
export function mediaUrl(supabaseUrl, path, cloudName) {
  if (!path) return null;
  return imageUrl(path, { cloudName, supabaseUrl, width: PREVIEW_WIDTH });
}

const absolute = (origin, url) => (!url ? null : /^https?:\/\//i.test(url) ? url : `${origin}${url.startsWith("/") ? "" : "/"}${url}`);

export function priceLine(item) {
  if (!item || item.price === null || item.price === undefined) return item?.price_type === "free" ? "Free" : "";
  const price = Number(item.price);
  if (!Number.isFinite(price)) return "";
  if (item.price_type === "from") return `From ${kes(price)}`;
  if (item.price_type === "range" && item.price_max != null) return `${kes(price)} to ${kes(item.price_max)}`;
  if (item.price_type === "contact") return "";
  return kes(price);
}

const where = (business) => [business.town, business.county].filter(Boolean).join(", ");

// One object describing everything the head needs. `business` and `item` are rows of public_businesses / public_items.
export function buildMeta({ origin, supabaseUrl, cloudName = "", business, item = null, categoryName = "" }) {
  const home = `${origin}/`;
  const fallbackImage = `${origin}/icon-512.png`;
  const place = where(business);

  if (item) {
    const canonical = `${origin}/b/${business.slug}/i/${encodeURIComponent(item.id)}`;
    const image = mediaUrl(supabaseUrl, item.image_paths?.[0], cloudName) ?? mediaUrl(supabaseUrl, business.cover_path, cloudName) ?? mediaUrl(supabaseUrl, business.logo_path, cloudName) ?? fallbackImage;
    const price = priceLine(item);
    const about = item.short_description || item.description;
    const lead = [price, about ? clip(about, 110) : ""].filter(Boolean).join(". ");
    const tail = `${business.name}${place ? ` in ${place}` : ""}`;
    const description = clip(lead ? `${lead.replace(/[.\s]+$/, "")}. Available at ${tail}.` : `${item.name} at ${tail}. Call or WhatsApp on ${BRAND}.`, 200);
    const seller = { "@type": "LocalBusiness", name: business.name, url: `${origin}/b/${business.slug}` };
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: item.name,
      url: canonical,
      ...(item.description ? { description: clip(item.description, 500) } : {}),
      ...(item.image_paths?.length ? { image: item.image_paths.map((p) => mediaUrl(supabaseUrl, p, cloudName)).filter(Boolean) } : {}),
      brand: { "@type": "Brand", name: business.name },
      ...(item.price !== null && item.price !== undefined && ["fixed", "from"].includes(item.price_type) && Number.isFinite(Number(item.price))
        ? {
            offers: {
              "@type": "Offer",
              url: canonical,
              priceCurrency: "KES",
              price: Number(item.price),
              availability: ["unavailable", "out_of_stock"].includes(item.availability) ? "https://schema.org/OutOfStock" : item.availability === "limited_stock" ? "https://schema.org/LimitedAvailability" : "https://schema.org/InStock",
              seller
            }
          }
        : {})
    };
    return { title: `${item.name} | ${business.name} | ${BRAND}`, description, canonical, image, imageAlt: item.name, type: "product", jsonLd, noindex: false };
  }

  const canonical = `${origin}/b/${business.slug}`;
  const image = mediaUrl(supabaseUrl, business.cover_path, cloudName) ?? mediaUrl(supabaseUrl, business.logo_path, cloudName) ?? fallbackImage;
  const about = business.tagline || business.description;
  const description = about
    ? clip(about, 200)
    : clip(`${business.name}${categoryName ? `, ${categoryName.toLowerCase()}` : ""}${place ? ` in ${place}` : ""}. Call, WhatsApp or get directions on ${BRAND}.`, 200);
  const sameAs = Object.values(business.socials ?? {}).filter((v) => typeof v === "string" && /^https?:\/\//i.test(v));
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: business.name,
    url: canonical,
    ...(description ? { description } : {}),
    ...(image !== fallbackImage ? { image } : {}),
    ...(business.phone ? { telephone: business.phone } : {}),
    ...(business.address || business.town || business.county
      ? { address: { "@type": "PostalAddress", ...(business.address ? { streetAddress: business.address } : {}), ...(business.town ? { addressLocality: business.town } : {}), ...(business.county ? { addressRegion: business.county } : {}), addressCountry: "KE" } }
      : {}),
    ...(Number.isFinite(Number(business.lat)) && Number.isFinite(Number(business.lng)) && business.lat !== null && business.lng !== null
      ? { geo: { "@type": "GeoCoordinates", latitude: Number(business.lat), longitude: Number(business.lng) } }
      : {}),
    ...(sameAs.length ? { sameAs } : {})
  };
  const title = [business.name, categoryName].filter(Boolean).join(" | ");
  return { title: `${title} | ${BRAND}`, description, canonical, image, imageAlt: business.name, type: "website", jsonLd, noindex: false };
}

export const notFoundMeta = ({ origin }) => ({
  title: `Page not found | ${BRAND}`,
  description: DEFAULT_DESCRIPTION,
  canonical: `${origin}/`,
  image: `${origin}/icon-512.png`,
  imageAlt: BRAND,
  type: "website",
  jsonLd: null,
  noindex: true
});

export function headTags(meta) {
  const tags = [
    `<link rel="canonical" href="${esc(meta.canonical)}" />`,
    `<meta property="og:site_name" content="${BRAND}" />`,
    `<meta property="og:type" content="${esc(meta.type)}" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:url" content="${esc(meta.canonical)}" />`,
    `<meta property="og:image" content="${esc(meta.image)}" />`,
    `<meta property="og:image:alt" content="${esc(meta.imageAlt)}" />`,
    `<meta property="og:locale" content="en_KE" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
    `<meta name="twitter:image" content="${esc(meta.image)}" />`
  ];
  if (meta.noindex) tags.push(`<meta name="robots" content="noindex" />`);
  // "<" is escaped so a seller's text can never close the script tag.
  if (meta.jsonLd) tags.push(`<script type="application/ld+json" id="preview-jsonld">${JSON.stringify(meta.jsonLd).replace(/</g, "\\u003c")}</script>`);
  return tags.join("\n    ");
}

// Takes the built index.html and returns it with this page's title, description and share tags in the head.
export function injectHead(html, meta) {
  let out = html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(meta.title)}</title>`)
    .replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${esc(meta.description)}" />`);
  // Drop any share tags the shell already carries so crawlers never see two of them.
  out = out.replace(/<link\s+rel="canonical"[^>]*>/gi, "").replace(/<meta\s+(?:property="og:|name="twitter:)[^>]*>/gi, "");
  // A noindex page must not also carry the shell's "index, follow", or crawlers see two answers.
  if (meta.noindex) out = out.replace(/<meta\s+name="robots"[^>]*>/gi, "");
  return out.replace(/<\/head>/i, `    ${headTags(meta)}\n  </head>`);
}

const XML = (value) => esc(value);

export const SITEMAP_LIMIT = 50000;

export const STATIC_PATHS = ["/", "/flash", "/offers", "/featured", "/sell", "/pricing", "/seller-guide", "/become-a-seller", "/about", "/contact", "/faq", "/privacy", "/terms", "/cookies"];

const day = (value) => {
  const time = Date.parse(value ?? "");
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null;
};

// businesses: [{ id, slug, created_at }], items: [{ id, business_id, created_at }]. Items of a business that is not in the
// list are skipped, so a hidden store never leaks through its items.
export function buildSitemap({ origin, businesses, items, categoryIds = [] }) {
  const slugOf = new Map(businesses.map((b) => [b.id, b.slug]));
  const entries = [
    ...STATIC_PATHS.map((path) => ({ loc: path === "/" ? `${origin}/` : `${origin}${path}` })),
    ...categoryIds.map((id) => ({ loc: `${origin}/c/${encodeURIComponent(id)}` })),
    ...businesses.filter((b) => b.slug).map((b) => ({ loc: `${origin}/b/${b.slug}`, lastmod: day(b.created_at) })),
    ...items.filter((i) => slugOf.get(i.business_id)).map((i) => ({ loc: `${origin}/b/${slugOf.get(i.business_id)}/i/${encodeURIComponent(i.id)}`, lastmod: day(i.created_at) }))
  ].slice(0, SITEMAP_LIMIT);
  const body = entries.map((e) => `  <url><loc>${XML(e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}</url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export const robotsTxt = (origin) =>
  `User-agent: *\nAllow: /\nDisallow: /seller/\nDisallow: /admin/\nDisallow: /search\nDisallow: /s/\nDisallow: /offline\nDisallow: /sell/register\nDisallow: /become-a-seller/status\n\nSitemap: ${origin}/sitemap.xml\n`;
