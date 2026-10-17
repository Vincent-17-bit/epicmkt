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

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
    css: false
  },
  plugins: [
    requireSupabase(),
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
            urlPattern: ({ url }) => url.pathname.includes("/rpc/get_server_time"),
            handler: "NetworkOnly"
          }
        ]
      }
    })
  ]
});
