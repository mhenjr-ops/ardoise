import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  BookOpenCheck,
  Building2,
  ClipboardList,
  GraduationCap,
  School,
} from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { DEMO_ENABLED } from "@/lib/demo";
import { Flash } from "@/components/ui";
import { PublicShell } from "@/components/public/public-shell";
import { demoSignIn } from "../login/actions";
import { BotCheck } from "@/components/bot-check";
import { botCheckKey } from "@/lib/bot-check";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.demo.title, robots: { index: false } };
}

/** One-tap demo accounts. Only when DEMO_LOGINS=on; real schools never see this page. */
export default async function DemoPage({ searchParams }: PageProps<"/demo">) {
  if (!DEMO_ENABLED) notFound();
  const { t, locale } = await getI18n();
  const { error } = await searchParams;

  const roles = [
    {
      role: "admin",
      label: t.demo.admin,
      help: t.roleHelp.owner,
      icon: School,
    },
    {
      role: "registrar",
      label: t.demo.registrar,
      help: t.roleHelp.registrar,
      icon: ClipboardList,
    },
    { role: "hod", label: t.demo.hod, help: t.roleHelp.hod, icon: Building2 },
    {
      role: "teacher",
      label: t.demo.teacher,
      help: t.roleHelp.teacher,
      icon: BookOpenCheck,
    },
    {
      role: "student",
      label: t.demo.student,
      help: t.roleHelp.student,
      icon: GraduationCap,
    },
  ];

  return (
    <PublicShell locale={locale}>
      <h1 className="font-display text-[2.4rem] font-semibold leading-tight">
        {t.demo.title}
      </h1>
      <p className="mt-2 text-[17px] text-slate-600">{t.demo.body}</p>
      <Flash
        error={
          error
            ? error === "captcha"
              ? t.auth.captcha
              : t.errors.generic
            : null
        }
      />
      <form action={demoSignIn}>
        <BotCheck siteKey={botCheckKey()} locale={locale} />
        <ul className="mt-7 space-y-3">
          {roles.map(({ role, label, help, icon: Icon }) => (
            <li key={role}>
              <button
                type="submit"
                name="role"
                value={role}
                className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-paper px-5 py-4 text-left transition-colors hover:border-ardoise hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ardoise"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ardoise text-chalk">
                  <Icon size={20} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-lg font-semibold text-slate-900">
                    {label}
                  </span>
                  <span className="block text-[14px] leading-snug text-slate-600">
                    {help}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </form>
      <p className="mt-6 text-[14px] text-slate-500">{t.demo.note}</p>
      <p className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[15px]">
        <Link
          href="/login"
          className="font-semibold text-brand-600 hover:underline"
        >
          {t.auth.signIn}
        </Link>
        <Link
          href="/request-demo"
          className="font-semibold text-brand-600 hover:underline"
        >
          {t.access.requestDemoLink}
        </Link>
      </p>
    </PublicShell>
  );
}
