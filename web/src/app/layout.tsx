import type { Metadata, Viewport } from "next";
import { getLocale } from "@/lib/i18n/server";
import "@fontsource-variable/alegreya";
import "@fontsource/alegreya-sans/400.css";
import "@fontsource/alegreya-sans/400-italic.css";
import "@fontsource/alegreya-sans/500.css";
import "@fontsource/alegreya-sans/700.css";
import "@fontsource/alegreya-sans/800.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Ardoise", template: "%s · Ardoise" },
  description: "La plateforme d'apprentissage des universités camerounaises.",
};

export const viewport: Viewport = {
  themeColor: "#1f3b36",
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
