import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "Champz",
    short_name: "Champz",
    description: "Campeonatos de FIFA entre amigos.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#07090f",
    theme_color: "#07090f",
    lang: "pt-BR",
    categories: ["sports", "games", "entertainment"],
    icons: [
      { src: "/icons/icon-192.png?v=2", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png?v=2", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Meus campeonatos", short_name: "Campeonatos", url: "/app", icons: [{ src: "/icons/shortcut-new-96.png?v=2", sizes: "96x96", type: "image/png" }] },
      { name: "Criar campeonato", short_name: "Criar", url: "/app/novo", icons: [{ src: "/icons/shortcut-new-96.png?v=2", sizes: "96x96", type: "image/png" }] },
    ],
  };
}
