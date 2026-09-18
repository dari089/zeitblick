import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Zeitblick · Deine Overlay Kamera",
  description: "Historische Perspektiven wiederfinden. Kamera mit Bildvorlage, einstellbarer Deckkraft und Fotos mit oder ohne Overlay. Privat und werbefrei.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Zeitblick" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/icon-192.png" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#131614" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="de"><body className="antialiased">{children}</body></html>;
}
