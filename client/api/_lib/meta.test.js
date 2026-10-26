import { describe, expect, it } from "vitest";
import { buildMeta, buildSitemap, clip, esc, headTags, injectHead, isUuid, kes, notFoundMeta, priceLine, robotsTxt } from "./meta.js";

const origin = "https://epicmkt.example";
const supabaseUrl = "https://x.supabase.co";
const ID = "11111111-1111-4111-8111-111111111111";
const BID = "22222222-2222-4222-8222-222222222222";

const business = {
  id: BID,
  slug: "fade-kings",
  name: "Fade Kings Barbershop",
  category_id: "barbershop",
  tagline: "Sharp cuts, fair prices",
  description: "Long description",
  phone: "+254700000000",
  socials: { instagram: "https://instagram.com/fadekings", note: "not a url" },
  county: "Kisumu",
  town: "Maseno",
  address: "Main Street",
  lat: -0.0053,
  lng: 34.6,
  logo_path: `${BID}/logo.webp`,
  cover_path: `${BID}/cover.webp`
};
const item = { id: ID, business_id: BID, name: "Skin fade", description: "A clean skin fade.", price: 500, price_max: null, price_type: "fixed", availability: "available", image_paths: [`${BID}/fade.webp`] };

const shell = `<!doctype html><html><head>
    <meta name="description" content="old" />
    <meta property="og:title" content="old title" />
    <meta name="twitter:card" content="summary" />
    <title>EpicMKT: Find local businesses in Kenya</title>
  </head><body><div id="root"></div></body></html>`;

describe("helpers", () => {
  it("escapes everything that could break out of an attribute", () => {
    expect(esc(`a"b<c>&'`)).toBe("a&quot;b&lt;c&gt;&amp;&#39;");
  });
  it("clips on a word boundary and collapses whitespace", () => {
    expect(clip("one   two\nthree", 50)).toBe("one two three");
    expect(clip("alpha beta gamma delta epsilon", 20)).toBe("alpha beta gamma…");
  });
  it("recognises uuids only", () => {
    expect(isUuid(ID)).toBe(true);
    expect(isUuid("fade")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
  it("formats prices by type", () => {
    expect(kes(1500)).toBe("KES 1,500");
    expect(priceLine({ price: 500, price_type: "fixed" })).toBe("KES 500");
    expect(priceLine({ price: 500, price_type: "from" })).toBe("From KES 500");
    expect(priceLine({ price: 500, price_max: 900, price_type: "range" })).toBe("KES 500 to KES 900");
    expect(priceLine({ price: null, price_type: "free" })).toBe("Free");
    expect(priceLine({ price: null, price_type: "contact" })).toBe("");
  });
});

describe("buildMeta for a business", () => {
  const meta = buildMeta({ origin, supabaseUrl, business, categoryName: "Barbershop" });
  it("titles, describes and points at the canonical url", () => {
    expect(meta.title).toBe("Fade Kings Barbershop | Barbershop | EpicMKT");
    expect(meta.description).toBe("Sharp cuts, fair prices");
    expect(meta.canonical).toBe(`${origin}/b/fade-kings`);
  });
  it("prefers the cover, then the logo, then the site icon", () => {
    expect(meta.image).toBe(`${supabaseUrl}/storage/v1/object/public/seller-media/${BID}/cover.webp`);
    expect(buildMeta({ origin, supabaseUrl, business: { ...business, cover_path: null } }).image).toContain("logo.webp");
    expect(buildMeta({ origin, supabaseUrl, business: { ...business, cover_path: null, logo_path: null } }).image).toBe(`${origin}/icon-512.png`);
  });
  it("writes a description when the store has no tagline or text", () => {
    const bare = buildMeta({ origin, supabaseUrl, business: { ...business, tagline: "", description: "" }, categoryName: "Barbershop" });
    expect(bare.description).toBe("Fade Kings Barbershop, barbershop in Maseno, Kisumu. Call, WhatsApp or get directions on EpicMKT.");
  });
  it("emits LocalBusiness JSON-LD with only real urls in sameAs", () => {
    expect(meta.jsonLd["@type"]).toBe("LocalBusiness");
    expect(meta.jsonLd.telephone).toBe("+254700000000");
    expect(meta.jsonLd.sameAs).toEqual(["https://instagram.com/fadekings"]);
    expect(meta.jsonLd.geo.latitude).toBe(-0.0053);
    expect(meta.jsonLd.address.addressCountry).toBe("KE");
  });
  it("leaves out geo when the store has no coordinates", () => {
    const noGeo = buildMeta({ origin, supabaseUrl, business: { ...business, lat: null, lng: null } });
    expect(noGeo.jsonLd.geo).toBeUndefined();
  });
});

describe("buildMeta for an item", () => {
  const meta = buildMeta({ origin, supabaseUrl, business, item, categoryName: "Barbershop" });
  it("uses the item as the page", () => {
    expect(meta.title).toBe("Skin fade | Fade Kings Barbershop | EpicMKT");
    expect(meta.canonical).toBe(`${origin}/b/fade-kings/i/${ID}`);
    expect(meta.image).toContain("fade.webp");
    expect(meta.type).toBe("product");
  });
  it("puts the price and the store in the description", () => {
    expect(meta.description).toBe("KES 500. A clean skin fade. Available at Fade Kings Barbershop in Maseno, Kisumu.");
  });
  it("still reads well when the item has no description or price", () => {
    const bare = buildMeta({ origin, supabaseUrl, business, item: { ...item, description: "", price: null, price_type: "contact" } });
    expect(bare.description).toBe("Skin fade at Fade Kings Barbershop in Maseno, Kisumu. Call or WhatsApp on EpicMKT.");
  });
  it("falls back to the store picture when the item has none", () => {
    expect(buildMeta({ origin, supabaseUrl, business, item: { ...item, image_paths: [] } }).image).toContain("cover.webp");
  });
  it("emits an Offer only for priced fixed or from items", () => {
    expect(meta.jsonLd.offers.price).toBe(500);
    expect(meta.jsonLd.offers.priceCurrency).toBe("KES");
    expect(buildMeta({ origin, supabaseUrl, business, item: { ...item, price_type: "contact", price: null } }).jsonLd.offers).toBeUndefined();
    expect(buildMeta({ origin, supabaseUrl, business, item: { ...item, price_type: "range", price_max: 900 } }).jsonLd.offers).toBeUndefined();
  });
  it("marks unavailable items out of stock", () => {
    expect(buildMeta({ origin, supabaseUrl, business, item: { ...item, availability: "unavailable" } }).jsonLd.offers.availability).toBe("https://schema.org/OutOfStock");
  });
});

describe("injectHead", () => {
  const out = injectHead(shell, buildMeta({ origin, supabaseUrl, business, item }));
  it("replaces the title and description", () => {
    expect(out).toContain("<title>Skin fade | Fade Kings Barbershop | EpicMKT</title>");
    expect(out).not.toContain('content="old"');
    expect(out.match(/<title>/g)).toHaveLength(1);
    expect(out.match(/name="description"/g)).toHaveLength(1);
  });
  it("replaces share tags instead of duplicating them", () => {
    expect(out).not.toContain("old title");
    expect(out.match(/property="og:title"/g)).toHaveLength(1);
    expect(out.match(/name="twitter:card"/g)).toHaveLength(1);
    expect(out).toContain('name="twitter:card" content="summary_large_image"');
  });
  it("adds a canonical link, the image and JSON-LD inside the head", () => {
    const head = out.slice(0, out.indexOf("</head>"));
    expect(head).toContain(`<link rel="canonical" href="${origin}/b/fade-kings/i/${ID}" />`);
    expect(head).toContain('property="og:image"');
    expect(head).toContain('type="application/ld+json"');
    expect(out).toContain('<div id="root"></div>');
  });
  it("cannot be broken by seller text", () => {
    const evil = buildMeta({ origin, supabaseUrl, business: { ...business, name: `</title><script>alert(1)</script>` } });
    const page = injectHead(shell, evil);
    expect(page).not.toContain("<script>alert(1)</script>");
    const ld = headTags(evil).match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)[1];
    expect(ld).not.toContain("<");
    expect(JSON.parse(ld).name).toBe("</title><script>alert(1)</script>");
  });
});

describe("notFoundMeta", () => {
  it("is noindex with no JSON-LD", () => {
    const page = injectHead(shell, notFoundMeta({ origin }));
    expect(page).toContain('<meta name="robots" content="noindex" />');
    expect(page).not.toContain("ld+json");
  });
});

describe("buildSitemap", () => {
  const xml = buildSitemap({
    origin,
    businesses: [{ id: BID, slug: "fade-kings", created_at: "2026-09-01T10:00:00Z" }],
    items: [
      { id: ID, business_id: BID, created_at: "2026-09-02T10:00:00Z" },
      { id: "orphan", business_id: "hidden-business", created_at: "2026-09-02T10:00:00Z" }
    ],
    categoryIds: ["barbershop"]
  });
  it("lists static pages, categories, stores and items", () => {
    expect(xml).toContain(`<loc>${origin}/</loc>`);
    expect(xml).toContain(`<loc>${origin}/flash</loc>`);
    expect(xml).toContain(`<loc>${origin}/c/barbershop</loc>`);
    expect(xml).toContain(`<loc>${origin}/b/fade-kings</loc><lastmod>2026-09-01</lastmod>`);
    expect(xml).toContain(`<loc>${origin}/b/fade-kings/i/${ID}</loc><lastmod>2026-09-02</lastmod>`);
  });
  it("skips items whose store is not listed", () => {
    expect(xml).not.toContain("orphan");
  });
  it("is well formed xml", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain("</urlset>");
  });
  it("escapes ampersands in urls", () => {
    const odd = buildSitemap({ origin, businesses: [{ id: "a", slug: "a&b", created_at: null }], items: [], categoryIds: [] });
    expect(odd).toContain("/b/a&amp;b</loc>");
  });
});

describe("robotsTxt", () => {
  it("points at this deployment's sitemap and keeps the seller and admin apps out", () => {
    const txt = robotsTxt(origin);
    expect(txt).toContain(`Sitemap: ${origin}/sitemap.xml`);
    expect(txt).toContain("Disallow: /seller/");
    expect(txt).toContain("Disallow: /admin/");
  });
});

describe("pictures stored in Cloudinary", () => {
  const cloudName = "demo";
  const photo = `${BID}/20000000-0000-0000-0000-0000000000c1/30000000-0000-0000-0000-0000000000d1`;
  const shop = { ...business, cover_path: `${BID}/profile/cover-30000000-0000-0000-0000-0000000000d2`, logo_path: `${BID}/profile/logo-30000000-0000-0000-0000-0000000000d3` };

  it("uses a 1200 px Cloudinary url for the link preview image", () => {
    const meta = buildMeta({ origin, supabaseUrl, cloudName, business: shop, item: { ...item, image_paths: [photo] } });
    expect(meta.image).toBe(`https://res.cloudinary.com/demo/image/upload/f_auto,q_auto:good,c_limit,w_1200/${photo}`);
    expect(meta.jsonLd.image).toEqual([meta.image]);
  });

  it("uses the shop cover, then the logo, for a store page", () => {
    expect(buildMeta({ origin, supabaseUrl, cloudName, business: shop }).image).toContain(`/${shop.cover_path}`);
    expect(buildMeta({ origin, supabaseUrl, cloudName, business: { ...shop, cover_path: null } }).image).toContain(`/${shop.logo_path}`);
  });

  it("still serves older pictures from Supabase, and falls back to the icon when a Cloudinary picture has no cloud configured", () => {
    expect(buildMeta({ origin, supabaseUrl, cloudName, business }).image).toBe(`${supabaseUrl}/storage/v1/object/public/seller-media/${BID}/cover.webp`);
    expect(buildMeta({ origin, supabaseUrl, business: shop }).image).toBe(`${origin}/icon-512.png`);
  });
});

describe("noindex pages and crawler files", () => {
  it("replaces the shell's robots tag instead of adding a second one", () => {
    const shell = '<html><head><title>x</title><meta name="robots" content="index, follow" /></head></html>';
    const page = injectHead(shell, notFoundMeta({ origin }));
    expect(page.match(/<meta name="robots"/g)).toHaveLength(1);
    expect(page).toContain('content="noindex"');
  });
  it("keeps the shell's robots tag on an indexable page", () => {
    const shell = '<html><head><title>x</title><meta name="robots" content="index, follow" /></head></html>';
    const page = injectHead(shell, { title: "t", description: "d", canonical: `${origin}/b/x`, image: `${origin}/i.png`, imageAlt: "x", type: "website", jsonLd: null, noindex: false });
    expect(page).toContain('content="index, follow"');
  });
  it("blocks private and transient pages in robots.txt and lists the featured page in the sitemap", () => {
    const txt = robotsTxt(origin);
    for (const path of ["/search", "/s/", "/offline", "/sell/register"]) expect(txt).toContain(`Disallow: ${path}`);
    expect(buildSitemap({ origin, businesses: [], items: [] })).toContain(`${origin}/featured`);
  });
});
