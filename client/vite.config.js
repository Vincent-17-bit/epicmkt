import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { buildSiteJsonLd, jsonLdTag, keywordsContent, resolveSiteUrl, verificationTags } from "./seo.js";

const requireSupabase = () => ({
  name: "require-supabase-env",
  apply: "build",
  configResolved(config) {
    if (config.mode !== "production" || config.env.VITE_ALLOW_MOCK_BUILD === "true") return;
    const missing = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"].filter((name) => !config.env[name]);
    if (missing.length) {
      throw new Error(`Production build needs ${missing.join(" and ")}. Flash sales and the clock must come from Supabase. Set VITE_ALLOW_MOCK_BUILD=true only for a demo build.`);
    }
  }
});

// Share tags need absolute urls. index.html writes them as __SITE_URL__/..., filled at build time from VITE_SITE_URL, or from the
// production domain Vercel reports (see resolveSiteUrl in seo.js), so epicmkt.vercel.app works with no setup and a new domain
// is picked up as soon as it is the project's production domain. With neither, the urls stay site-relative (fine for local use).
const siteUrlInHtml = (site) => ({
  name: "site-url-in-html",
  transformIndexHtml: (html) => html.replaceAll("__SITE_URL__", site)
});

// Fills the placeholders in index.html that need data: keywords, the Google/Bing "this site is mine" tags, and the JSON-LD that
// tells search engines what EpicMKT is (website, organization, installable app).
const seoHead = (site, env) => ({
  name: "seo-head",
  transformIndexHtml: (html) =>
    html
      .replaceAll("__KEYWORDS__", keywordsContent())
      .replace("<!--SEO_VERIFY-->", verificationTags(env))
      .replace(
        "<!--SEO_JSONLD-->",
        jsonLdTag(
          buildSiteJsonLd({
            site,
            socials: [env.VITE_SOCIAL_FACEBOOK, env.VITE_SOCIAL_INSTAGRAM, env.VITE_SOCIAL_TIKTOK, env.VITE_SOCIAL_X],
            email: env.VITE_CONTACT_EMAIL,
            phone: env.VITE_CONTACT_PHONE
          })
        )
      )
});

// Opens the connection to Supabase (DNS, TCP, TLS) while the page is still parsing, so the first data request and the first
// pictures do not pay for it. Skipped when no Supabase URL is set (demo and test builds).
const preconnectOrigins = () => {
  let origins = [];
  return {
    name: "preconnect-media",
    configResolved(config) {
      const origin = (value) => {
        try {
          return new URL(String(value ?? "")).origin;
        } catch {
          return "";
        }
      };
      // Supabase carries the data; Cloudinary's CDN carries every picture, so its connection is opened early too.
      const cloud = String(config.env.VITE_CLOUDINARY_CLOUD_NAME ?? "").trim();
      // <img> tags load without CORS, so the picture host is preconnected without `crossorigin` (a different pool would go unused).
      origins = [{ href: origin(config.env.VITE_SUPABASE_URL), cors: true }, { href: cloud ? "https://res.cloudinary.com" : "", cors: false }].filter((o) => o.href);
    },
    transformIndexHtml: (html) =>
      origins.length
        ? html.replace("</title>", `</title>\n    ${origins.map((o) => `<link rel="preconnect" href="${o.href}"${o.cors ? " crossorigin" : ""} />\n    <link rel="dns-prefetch" href="${o.href}" />`).join("\n    ")}`)
        : html
  };
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const site = resolveSiteUrl(env, process.env);
  return {
    // The app reads VITE_SITE_URL for its own canonical links; hand it the resolved address so it matches the server's.
    define: site ? { "import.meta.env.VITE_SITE_URL": JSON.stringify(site) } : {},
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/test/setup.js",
      css: false
    },
    plugins: [
      requireSupabase(),
      siteUrlInHtml(site),
      seoHead(site, env),
      preconnectOrigins(),
      react(),
      VitePWA({
        registerType: "prompt",
        includeAssets: ["favicon.svg", "apple-touch-icon.png"],
        manifest: {
          // A fixed id keeps the installed app the same app even if the start url ever changes.
          id: "/",
          name: "EpicMKT: Find local businesses in Kenya",
          short_name: "EpicMKT",
          description: "Find barbershops, water refill points, chemists, agrovets, gyms and more near you in Kenya. Call, WhatsApp or get directions.",
          lang: "en",
          dir: "ltr",
          start_url: "/",
          scope: "/",
          display: "standalone",
          display_override: ["standalone", "minimal-ui"],
          orientation: "portrait",
          theme_color: "#FFFFFF",
          background_color: "#F3F4F6",
          categories: ["business", "lifestyle", "shopping"],
          prefer_related_applications: false,
          shortcuts: [
            { name: "Flash sales", short_name: "Flash sales", description: "Deals running right now", url: "/flash", icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }] },
            { name: "Offers", short_name: "Offers", description: "Deals and discounts nearby", url: "/offers", icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }] },
            { name: "Search businesses", short_name: "Search", description: "Find a business near you", url: "/search", icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }] }
          ],
          icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
          ]
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
          // The share picture is only for link previews and search results; phones never need it offline.
          globIgnores: ["og-image.png"],
          navigateFallback: "/index.html",
          // These are served by the edge handlers in client/api, so a visitor who has the app installed still reaches them.
          navigateFallbackDenylist: [/^\/api\//, /^\/sitemap\.xml$/, /^\/robots\.txt$/],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              urlPattern: ({ url }) => /\/rest\/v1\/(public_flash_sales|public_items|public_businesses)/.test(url.pathname),
              handler: "NetworkFirst",
              options: {
                cacheName: "flash-api",
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 20, maxAgeSeconds: 60 },
                cacheableResponse: { statuses: [200] }
              }
            },
            {
              urlPattern: ({ url }) => /\/rest\/v1\/categories/.test(url.pathname),
              handler: "NetworkFirst",
              options: {
                cacheName: "categories-api",
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 },
                cacheableResponse: { statuses: [200] }
              }
            },
            {
              // Pictures and videos are cached on the device, so a product seen once is not downloaded again.
              urlPattern: ({ request, url }) =>
                request.destination === "image" && (url.hostname === "res.cloudinary.com" || /\/storage\/v1\/(object|render\/image)\/public\//.test(url.pathname)),
              handler: "CacheFirst",
              options: {
                cacheName: "media-images",
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true },
                cacheableResponse: { statuses: [0, 200] }
              }
            },
            {
              urlPattern: ({ url }) => url.pathname.includes("/rpc/get_server_time"),
              handler: "NetworkOnly"
            }
          ]
        }
      })
    ]
  };
});
