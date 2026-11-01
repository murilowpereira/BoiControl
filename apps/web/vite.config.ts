import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  resolve: {
    alias: { "@boicontrol/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)) },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icone.svg", "apple-touch-icon.png"],
      manifest: {
        name: "BoiControl",
        short_name: "BoiControl",
        description: "Controle individual de animais e pesagens",
        lang: "pt-BR",
        theme_color: "#1f3d2b",
        background_color: "#f6f4ee",
        display: "standalone",
        start_url: "/",
        scope: "/",
        orientation: "portrait",
        icons: [
          { src: "icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "icone.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
      workbox: { navigateFallback: "/index.html", globPatterns: ["**/*.{js,css,html,svg,png,woff2}"] },
    }),
  ],
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
