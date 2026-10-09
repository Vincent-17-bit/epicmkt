import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { viteBase } from "@epicmkt/shared";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const base = viteBase(env.VITE_BASE_PATH);
  return {
    base,
    server: { port: 5174, strictPort: true },
    preview: { port: 5174 },
    test: { environment: "jsdom", globals: true, setupFiles: "./src/test/setup.js" },
    plugins: [
      react(),
      VitePWA({
        registerType: "prompt",
        filename: "seller-sw.js",
        manifestFilename: "seller.webmanifest",
        includeAssets: ["favicon.svg", "apple-touch-icon.png"],
        manifest: {
          id: "epicmkt-seller",
          name: "EpicMKT Business",
          short_name: "Business",
          start_url: base,
          scope: base,
          display: "standalone",
          theme_color: "#FFFFFF",
          background_color: "#F3F4F6",
          icons: [
            { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
          ]
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
          navigateFallback: `${base}index.html`,
          cleanupOutdatedCaches: true
        }
      })
    ]
  };
});
