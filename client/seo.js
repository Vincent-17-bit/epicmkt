// Build-time search and share setup for the public site. vite.config.js calls these; nothing here runs in the browser.
// Kept as plain functions so they can be unit tested (seo.test.js).

export const SITE_NAME = "EpicMKT";
export const SITE_SLOGAN = "Local made easy.";
export const SITE_ALT_NAMES = ["Epic MKT", "EpicMKT Kenya", "EpicMKT App"];
export const SITE_DESCRIPTION =
  "Find barbershops, water refill points, chemists, agrovets, gyms and more near you in Kenya. Call, WhatsApp or get directions.";

// What the app is, in a line, for search engines that describe an installable web app.
export const APP_FEATURES = [
  "Search local businesses by name, category and place",
  "Call, WhatsApp or get directions in one tap",
  "Flash sales and offers from nearby businesses",
  "Install it on your phone like an app"
];

// Keep this honest and short. Google ignores it, Bing reads it lightly; it still helps other directories and tools.
export const KEYWORDS = [
  "EpicMKT",
  "Epic MKT",
  "EpicMKT Kenya",
  "local business directory Kenya",
  "find businesses near me",
  "barbershop near me",
  "water refill station",
  "chemist near me",
  "agrovet",
  "gym Kenya",
  "call WhatsApp directions",
  "list your business in Kenya",
  "flash sales Kenya"
];

// The address people reach the site on. In order of preference:
//   1. VITE_SITE_URL, which you set once your own domain is live (https://epicmkt.app).
//   2. The production domain Vercel already knows (VERCEL_PROJECT_PRODUCTION_URL). Once you add your own domain to the
//      project, Vercel switches this to it, so the site follows the domain without any code change.
//   3. Nothing. Local builds then keep site-relative urls.
export function resolveSiteUrl(env = {}, system = {}) {
  const clean = (value) => {
    const text = String(value ?? "").trim().replace(/\/+$/, "");
    if (!text) return "";
    return /^https?:\/\//i.test(text) ? text : `https://${text}`;
  };
  return clean(env.VITE_SITE_URL) || clean(system.VERCEL_PROJECT_PRODUCTION_URL);
}

const httpUrl = (value) => (/^https?:\/\//i.test(String(value ?? "").trim()) ? String(value).trim() : "");

// Structured data the search engines read to learn what the site, the company and the app are. Returns null when no site
// url is known, because every @id and link in it must be absolute.
export function buildSiteJsonLd({ site, socials = [], email = "", phone = "" }) {
  if (!site) return null;
  const org = `${site}/#organization`;
  const sameAs = socials.map(httpUrl).filter(Boolean);
  const contact = [email ? { email } : null, phone ? { telephone: phone } : null].filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${site}/#website`,
        url: `${site}/`,
        name: SITE_NAME,
        alternateName: SITE_ALT_NAMES,
        description: SITE_DESCRIPTION,
        inLanguage: "en-KE",
        publisher: { "@id": org },
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${site}/search?q={search_term_string}` },
          "query-input": "required name=search_term_string"
        }
      },
      {
        "@type": "Organization",
        "@id": org,
        name: SITE_NAME,
        alternateName: SITE_ALT_NAMES,
        url: `${site}/`,
        logo: { "@type": "ImageObject", url: `${site}/icon-512.png`, width: 512, height: 512 },
        image: `${site}/og-image.png`,
        slogan: SITE_SLOGAN,
        description: SITE_DESCRIPTION,
        areaServed: { "@type": "Country", name: "Kenya" },
        ...(sameAs.length ? { sameAs } : {}),
        ...(contact.length ? { contactPoint: contact.map((c) => ({ "@type": "ContactPoint", contactType: "customer support", areaServed: "KE", availableLanguage: ["English"], ...c })) } : {})
      },
      {
        "@type": "WebApplication",
        "@id": `${site}/#app`,
        name: SITE_NAME,
        url: `${site}/`,
        description: SITE_DESCRIPTION,
        applicationCategory: "LifestyleApplication",
        operatingSystem: "Any",
        browserRequirements: "Requires JavaScript",
        inLanguage: "en-KE",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "KES" },
        featureList: APP_FEATURES,
        publisher: { "@id": org }
      }
    ]
  };
}

// "<" is escaped so no value can ever close the script tag.
export const jsonLdTag = (data) =>
  data ? `<script type="application/ld+json" id="site-jsonld">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>` : "";

const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// The tags Google Search Console and Bing Webmaster Tools ask for when you prove the site is yours.
export function verificationTags(env = {}) {
  const tags = [];
  const google = String(env.VITE_GOOGLE_SITE_VERIFICATION ?? "").trim();
  const bing = String(env.VITE_BING_SITE_VERIFICATION ?? "").trim();
  if (google) tags.push(`<meta name="google-site-verification" content="${esc(google)}" />`);
  if (bing) tags.push(`<meta name="msvalidate.01" content="${esc(bing)}" />`);
  return tags.join("\n    ");
}

export const keywordsContent = () => KEYWORDS.join(", ");
