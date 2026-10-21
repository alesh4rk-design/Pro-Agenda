import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon.svg"],
      manifest: {
        // O nome exibido dentro do app é configurável (config/publico.nomeSistema);
        // o manifesto usa um nome neutro porque é estático.
        name: "Rondas Patrimoniais",
        short_name: "Rondas",
        description: "Gestão de rondas patrimoniais",
        lang: "pt-BR",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Apenas o "app shell" é cacheado. Dados da API nunca são servidos do cache
        // como se fossem atuais; o Firestore usa o próprio cache persistente.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/v1\//],
      },
    }),
  ],
});
