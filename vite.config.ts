import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["pwa-512x512.png", "pwa-192x192.png", "apple-touch-icon.png"],
      manifest: {
        name: "Roude Leiw",
        short_name: "Roude Leiw",
        description: "Learn Luxembourgish — match words across levels",
        theme_color: "#dc2626",
        background_color: "#0f172a",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Manifest is the lessons index — must be fresh so new/renamed
            // lessons appear without waiting for the cache to expire.
            urlPattern: /^\/assets\/lessons\/manifest\.json$/,
            handler: "NetworkFirst",
            options: {
              cacheName: "lessons-manifest-v2",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            // .letz files: serve from cache for instant load, refresh in background.
            urlPattern: /^\/assets\/lessons\/.+\.letz$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "lessons-content-v2",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            urlPattern: /^\/api\//,
            handler: "NetworkOnly",
          },
        ],
      },
    }),
    cloudflare(),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
  ],
  build: {
    outDir: "dist",
  },
});
