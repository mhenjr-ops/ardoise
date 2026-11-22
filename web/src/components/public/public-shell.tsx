import Link from "next/link";
import type { ReactNode } from "react";
import { NDOP_CHALK } from "@/lib/ndop";
import type { Locale } from "@/lib/i18n/messages";
import { Wordmark } from "@/components/brand";
import { LocaleSwitch } from "@/components/locale-switch";

/** Frame for pages people reach without signing in: invitations, demo requests, transcript checks. */
export function PublicShell({ locale, children, wide = false }: { locale: Locale; children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col bg-sand">
      <header className="relative overflow-hidden bg-ardoise text-chalk">
        <div aria-hidden className="absolute inset-0 opacity-50" style={{ backgroundImage: NDOP_CHALK, backgroundSize: "72px 72px" }} />
        <div className={`relative mx-auto flex items-center justify-between px-5 py-4 ${wide ? "max-w-5xl" : "max-w-2xl"}`}>
          <Link href="/">
            <Wordmark dark />
          </Link>
          <LocaleSwitch locale={locale} dark />
        </div>
      </header>
      <main className={`mx-auto w-full flex-1 px-5 py-10 ${wide ? "max-w-5xl" : "max-w-2xl"}`}>{children}</main>
    </div>
  );
}
