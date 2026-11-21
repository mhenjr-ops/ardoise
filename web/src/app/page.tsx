import Link from "next/link";
import type { Metadata } from "next";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  FileCheck2,
  FolderOpen,
  Inbox,
  Landmark,
  ListChecks,
  MessagesSquare,
  NotebookPen,
  QrCode,
  Smartphone,
  Timer,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { DEMO_ENABLED } from "@/lib/demo";
import { NDOP_CHALK, NDOP_INK } from "@/lib/ndop";
import { buttonClass } from "@/components/ui";
import { LocaleSwitch } from "@/components/locale-switch";
import { Wordmark } from "@/components/brand";
import { ChalkMotif } from "@/components/chalk-motif";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: { absolute: t.landing.metaTitle }, description: t.landing.heroBody };
}

export default async function Landing() {
  const [{ t, locale }, supabase] = await Promise.all([getI18n(), createClient()]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const L = t.landing;
  const fr = locale === "fr";
  const demoHref = DEMO_ENABLED ? "/login#demo" : "/login";

  const features = [
    { icon: BookOpen, label: L.f.modules },
    { icon: NotebookPen, label: L.f.assignments },
    { icon: Timer, label: L.f.quizzes },
    { icon: ListChecks, label: L.f.speedgrader },
    { icon: MessagesSquare, label: L.f.discussions },
    { icon: Inbox, label: L.f.inbox },
    { icon: CalendarDays, label: L.f.calendar },
    { icon: Smartphone, label: L.f.attendance },
    { icon: FolderOpen, label: L.f.files },
    { icon: BarChart3, label: L.f.analytics },
    { icon: Landmark, label: L.f.deliberation },
    { icon: QrCode, label: L.f.transcripts },
  ];

  const board = [
    { name: "Mireille Tchoumi", avg: fr ? "14,71" : "14.71", decision: t.lmd.decisions.admitted, tone: "leaf" },
    { name: "Brenda Fon", avg: fr ? "13,21" : "13.21", decision: t.lmd.decisions.admitted, tone: "leaf" },
    { name: "Inès Kamga", avg: fr ? "11,55" : "11.55", decision: t.lmd.decisions.admitted, tone: "leaf" },
    { name: "Cédric Nkoulou", avg: fr ? "10,06" : "10.06", decision: t.lmd.decisions.admitted_compensation, tone: "indigo" },
    { name: "Yannick Abena", avg: fr ? "7,45" : "7.45", decision: t.lmd.decisions.resit, tone: "terracotta" },
  ];
  const toneClass = {
    leaf: "bg-leaf-50 text-leaf-700",
    indigo: "bg-indigo-50 text-indigo-700",
    terracotta: "bg-terracotta-50 text-terracotta-600",
  } as const;

  return (
    <div className="bg-sand text-slate-900">
      {/* Header */}
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-[1200px] items-center gap-4 px-5 py-5 md:px-8">
          <Wordmark dark />
          <nav className="ml-auto flex items-center gap-1 text-chalk">
            <div className="[&_button]:text-chalk/85 [&_button:hover]:bg-white/10">
              <LocaleSwitch locale={locale} dark />
            </div>
            {user ? (
              <Link href="/dashboard" className={buttonClass("accent")}>
                {t.shell.openDashboard}
              </Link>
            ) : (
              <>
                <Link href="/login" className="hidden h-10 items-center rounded-full px-4 text-[15px] font-semibold text-chalk/90 hover:bg-white/10 sm:flex">
                  {L.ctaSignIn}
                </Link>
                <Link href={demoHref} className={buttonClass("accent")}>
                  {L.ctaDemo}
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero: the slate */}
      <section className="relative overflow-hidden bg-ardoise pb-24 pt-32 text-chalk md:pb-36 md:pt-40">
        <div aria-hidden className="absolute inset-0 opacity-50" style={{ backgroundImage: NDOP_CHALK }} />
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_30%,transparent_0%,var(--color-ardoise)_70%)]" />
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-14 px-5 md:px-8 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <h1 className="font-display text-[2.9rem] font-semibold leading-[1.02] tracking-[-0.02em] sm:text-[4.2rem]">
              {L.heroTitle}
            </h1>
            <p className="mt-6 max-w-[34rem] text-[18px] leading-relaxed text-chalk/75">{L.heroBody}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href={user ? "/dashboard" : demoHref} className={buttonClass("accent", "lg")}>
                {user ? t.shell.openDashboard : L.ctaDemo}
              </Link>
              {!user ? (
                <Link
                  href="/login"
                  className="inline-flex h-12 items-center rounded-[10px] border border-chalk/25 px-6 text-base font-semibold text-chalk hover:bg-white/10"
                >
                  {L.ctaSignIn}
                </Link>
              ) : null}
              {/* Plain <a>: /app is the exported phone app, not a Next.js route. */}
              <a
                href="/app"
                className="inline-flex h-12 items-center gap-2 rounded-[10px] px-4 text-base font-semibold text-ochre-300 hover:bg-white/10"
              >
                <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
                  <path d="M11 18.5h2" />
                </svg>
                {L.ctaPhone}
              </a>
            </div>
            <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-[14.5px] text-chalk/70">
              {[L.proofLmd, L.proofBilingual, L.proofPhone, L.proofData].map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <span aria-hidden className="h-1.5 w-1.5 rotate-45 bg-ochre-400" />
                  {p}
                </li>
              ))}
            </ul>
          </div>

          {/* The product, as it looks on deliberation day */}
          <div className="relative">
            <ChalkMotif className="absolute -right-24 -top-24 hidden w-[520px] opacity-40 lg:block" />
            <div className="relative rounded-[22px] border border-white/10 bg-paper p-1.5 text-slate-900 shadow-float">
              <div className="rounded-[18px] border border-slate-200 bg-paper">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                  <div>
                    <p className="font-display text-lg font-semibold">Licence Informatique, L1</p>
                    <p className="text-[13px] text-slate-500">{fr ? "Semestre 1, 2026-2027" : "Semester 1, 2026-2027"}</p>
                  </div>
                  <span className="rounded-full bg-ochre-100 px-3 py-1 text-[12.5px] font-bold text-ochre-700">
                    {t.lmd.status.published}
                  </span>
                </div>
                <ul>
                  {board.map((row, i) => (
                    <li
                      key={row.name}
                      className="flex items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0"
                      style={{ animation: `rise 0.6s cubic-bezier(0.22,1,0.36,1) ${1.2 + i * 0.12}s both` }}
                    >
                      <span className="flex-1 text-[15px] font-semibold">{row.name}</span>
                      <span className="num w-14 text-right font-display text-lg font-semibold">{row.avg}</span>
                      <span className={`hidden w-[11.5rem] rounded-full px-2.5 py-0.5 text-center text-[12.5px] font-bold sm:inline-block ${toneClass[row.tone as keyof typeof toneClass]}`}>
                        {row.decision}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {/* Phone with the attendance code */}
            <div className="absolute -bottom-28 -left-10 hidden w-[200px] rotate-[-4deg] rounded-[28px] border-[6px] border-ardoise-deep bg-paper p-4 text-center shadow-float sm:block">
              <p className="text-[12px] font-semibold text-slate-500">{t.attendance.checkInTitle}</p>
              <p className="num mt-2 font-display text-[2rem] font-semibold tracking-[0.12em] text-ardoise">482 913</p>
              <span className="mt-3 block rounded-lg bg-ardoise py-2 text-[13px] font-bold text-chalk">{t.attendance.checkIn}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Three jobs */}
      <section className="mx-auto max-w-[1200px] px-5 py-20 md:px-8 md:py-28">
        <h2 className="max-w-xl font-display text-[2.3rem] font-semibold leading-tight">{L.forTitle}</h2>
        <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-0 md:divide-x md:divide-dashed md:divide-slate-300">
          {[
            { title: L.forStudents, body: L.forStudentsBody, icon: Smartphone },
            { title: L.forTeachers, body: L.forTeachersBody, icon: ClipboardCheck },
            { title: L.forOffice, body: L.forOfficeBody, icon: FileCheck2 },
          ].map((col) => (
            <div key={col.title} className="md:px-8 md:first:pl-0 md:last:pr-0">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-ardoise text-ochre-400">
                <col.icon size={22} aria-hidden />
              </span>
              <h3 className="mt-5 font-display text-2xl font-semibold">{col.title}</h3>
              <p className="mt-3 text-[16.5px] leading-relaxed text-slate-600">{col.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* The real sequence: mark → transcript */}
      <section className="relative overflow-hidden border-y border-slate-200 bg-paper">
        <div aria-hidden className="absolute inset-0 opacity-50" style={{ backgroundImage: NDOP_INK }} />
        <div className="relative mx-auto max-w-[1200px] px-5 py-20 md:px-8 md:py-24">
          <h2 className="max-w-xl font-display text-[2.3rem] font-semibold leading-tight">{L.flowTitle}</h2>
          <ol className="mt-12 grid gap-6 md:grid-cols-4">
            {[L.flow1, L.flow2, L.flow3, L.flow4].map((step, i) => (
              <li key={step} className="relative">
                <div className="flex items-center gap-3">
                  <span className="num grid h-10 w-10 place-items-center rounded-full bg-ochre-500 font-display text-lg font-bold text-slate-950">
                    {i + 1}
                  </span>
                  {i < 3 ? <span aria-hidden className="hidden h-px flex-1 border-t border-dashed border-slate-400 md:block" /> : null}
                </div>
                <p className="mt-4 text-[16.5px] leading-relaxed text-slate-700">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Everything else */}
      <section className="mx-auto max-w-[1200px] px-5 py-20 md:px-8 md:py-28">
        <h2 className="max-w-2xl font-display text-[2.3rem] font-semibold leading-tight">{L.featuresTitle}</h2>
        <ul className="mt-12 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <li key={f.label} className="flex items-center gap-4 border-b border-slate-200 pb-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-ardoise">
                <f.icon size={20} aria-hidden />
              </span>
              <span className="text-[16.5px] font-semibold text-slate-800">{f.label}</span>
            </li>
          ))}
        </ul>
        <blockquote className="mt-20 max-w-3xl border-l-4 border-ochre-500 pl-6 font-display text-[1.75rem] leading-snug text-slate-800">
          {L.quote}
        </blockquote>
      </section>

      {/* Closing */}
      <section className="relative overflow-hidden bg-ardoise text-chalk">
        <div aria-hidden className="absolute inset-0 opacity-40" style={{ backgroundImage: NDOP_CHALK }} />
        <div className="relative mx-auto flex max-w-[1200px] flex-col items-start gap-6 px-5 py-20 md:flex-row md:items-center md:justify-between md:px-8">
          <div>
            <h2 className="font-display text-[2.4rem] font-semibold leading-tight">{L.finalTitle}</h2>
            <p className="mt-3 max-w-xl text-[17px] text-chalk/75">{L.finalBody}</p>
          </div>
          <Link href={user ? "/dashboard" : demoHref} className={buttonClass("accent", "lg")}>
            {user ? t.shell.openDashboard : L.ctaDemo}
          </Link>
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-5 py-8 text-[14px] text-slate-500 md:px-8">
        <Wordmark />
        <span>{L.footer}</span>
      </footer>
    </div>
  );
}
