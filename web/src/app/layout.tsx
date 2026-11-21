import type { Metadata, Viewport } from "next";
import { getLocale } from "@/lib/i18n/server";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Ardoise", template: "%s · Ardoise" },
  description: "La plateforme d'apprentissage des universités camerounaises.",
};

export const viewport: Viewport = {
  themeColor: "#16202c",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html lang={locale} className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
