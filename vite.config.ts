import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Pitbull Prêmio",
        short_name: "Pitbull Prêmio",
        description: "Atividades e recompensas do Pitbull Prêmio.",
        theme_color: "#0b0b0f",
        background_color: "#0b0b0f",
        display: "standalone",
        lang: "pt-BR",
        start_url: "/"
      }
    })
  ]
});