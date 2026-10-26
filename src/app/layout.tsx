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
  appleWebApp: { capable: true, title: "Champz", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/192", apple: "/icons/180" },
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
