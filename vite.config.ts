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
            urlPattern: /^\/assets\/lessons\//,
            handler: "CacheFirst",
            options: {
              cacheName: "lessons-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
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
