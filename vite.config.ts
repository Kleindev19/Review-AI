
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),

    VitePWA({
      registerType: "autoUpdate",

      includeAssets: [
        "favicon.ico",
        "studyroom-logo.svg",
        "apple-touch-icon-180x180.png",
      ],

      manifest: {
        name: "StudyRoom - AI Study Platform",
        short_name: "StudyRoom",

        description:
          "An AI-powered study platform for creating reviewers, flashcards, and practice quizzes.",

        theme_color: "#071F41",
        background_color: "#ffffff",

        display: "standalone",
        start_url: "/",
        scope: "/",

        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },

      workbox: {
        navigateFallback: "/index.html",

        globPatterns: [
          "**/*.{js,css,html,ico,png,svg,woff2}",
        ],

        // Allow the larger PDF export bundle
        // to be included in the PWA precache.
        maximumFileSizeToCacheInBytes:
          3 * 1024 * 1024,

        // Remove outdated cached assets
        // after a new deployment.
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
