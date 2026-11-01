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
      includeAssets: ["icone.svg"],
      manifest: {
        name: "BoiControl",
        short_name: "BoiControl",
        description: "Controle individual de animais e pesagens",
        lang: "pt-BR",
        theme_color: "#1f3d2b",
        background_color: "#f6f4ee",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "icone.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      workbox: { navigateFallback: "/index.html", globPatterns: ["**/*.{js,css,html,svg,woff2}"] },
    }),
  ],
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
