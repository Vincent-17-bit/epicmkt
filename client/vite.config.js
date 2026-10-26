import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

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

// Share tags need absolute urls. index.html writes them as __SITE_URL__/..., filled from VITE_SITE_URL at build time.
// Left unset, the urls stay site-relative: harmless for the app, but set it on the production build for good previews.
const siteUrlInHtml = () => {
  let site = "";
  return {
    name: "site-url-in-html",
    configResolved(config) {
      site = String(config.env.VITE_SITE_URL ?? "").replace(/\/$/, "");
    },
    transformIndexHtml: (html) => html.replaceAll("__SITE_URL__", site)
  };
};

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

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
    css: false
  },
  plugins: [
    requireSupabase(),
    siteUrlInHtml(),
    preconnectOrigins(),
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "EpicMKT",
        short_name: "EpicMKT",
        description: "Find local businesses in Kenya and contact them by call, WhatsApp or directions.",
        lang: "en",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        theme_color: "#FFFFFF",
        background_color: "#F3F4F6",
        categories: ["business", "lifestyle"],
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
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
});
