import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Manrope } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

const display = Barlow_Condensed({ variable: "--font-display", subsets: ["latin"], weight: ["600", "700", "800"] });
const body = Manrope({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Champz", template: "%s · Champz" },
  description: "Campeonatos de FIFA entre amigos: grupos, mata-mata, placares, estatísticas e retrospectiva.",
  applicationName: "Champz",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://champz-six.vercel.app"),
  appleWebApp: { capable: true, title: "Champz", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icons/favicon-32.png?v=2", sizes: "32x32", type: "image/png" }, { url: "/icons/icon-192.png?v=2", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png?v=2", sizes: "180x180" }],
  },
  openGraph: { type: "website", siteName: "Champz", locale: "pt_BR", title: "Champz", description: "Campeonatos de FIFA entre amigos: grupos, mata-mata, placares, estatísticas e retrospectiva." },
  twitter: { card: "summary_large_image", title: "Champz", description: "Campeonatos de FIFA entre amigos." },
};

export const viewport: Viewport = {
  themeColor: "#07090f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable} antialiased`}>
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
