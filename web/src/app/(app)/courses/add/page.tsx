import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Check, Search, UsersRound } from "lucide-react";
import { requireInstitution } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/messages-engage";
import { Button, Card, Flash, Input, PageHeader } from "@/components/ui";
import { leaveCourse, teachCourse } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.teach.title };
}

type Row = { id: string; code: string; title: string; department: string | null; semester: string | null; teachers: string; teaching: boolean };

/** Lecturers pick the courses they teach from the school's list for the semester. */
export default async function AddCoursePage({ searchParams }: PageProps<"/courses/add">) {
  const [{ supabase, can }, { t }] = await Promise.all([requireInstitution(), getI18n()]);
  if (!can.isStaff) redirect("/dashboard");
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 80);
  const { data } = await supabase.rpc("course_catalogue", { p_query: q });
  const rows = (data ?? []) as Row[];
  const ok = sp.added ? t.teach.added : sp.left ? t.teach.left : null;

  const hidden = (id: string) => (
    <>
      <input type="hidden" name="id" value={id} />
      {q ? <input type="hidden" name="q" value={q} /> : null}
    </>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t.teach.title} subtitle={t.teach.intro} />
      <Flash ok={ok} error={errorText(t, typeof sp.error === "string" ? sp.error : null)} />

      <form className="mb-5 flex gap-2" role="search">
        <div className="relative flex-1">
          <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input name="q" defaultValue={q} placeholder={t.teach.search} aria-label={t.teach.search} className="pl-9" />
        </div>
        <Button type="submit" variant="secondary">
          {t.teach.searchButton}
        </Button>
      </form>

      {rows.length ? (
        <Card>
          <ul className="divide-y divide-slate-100">
            {rows.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">
                    <span className="mr-2 text-brand-600">{c.code}</span>
                    {c.title}
                  </p>
                  <p className="text-[13.5px] text-slate-500">
                    {[c.department, c.semester].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[13.5px] text-slate-600">
                    <UsersRound size={14} className="text-slate-400" aria-hidden />
                    {c.teachers ? fmt(t.teach.taughtBy, { names: c.teachers }) : t.teach.noTeacher}
                  </p>
                </div>
                {c.teaching ? (
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/courses/${c.id}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-leaf-50 px-3 py-1 text-[13px] font-semibold text-leaf-700 ring-1 ring-leaf-100"
                    >
                      <Check size={14} aria-hidden />
                      {t.teach.onDashboard}
                    </Link>
                    <form action={leaveCourse}>
                      {hidden(c.id)}
                      <button type="submit" className="text-[13px] font-semibold text-slate-500 hover:text-terracotta-600">
                        {t.teach.leave}
                      </button>
                    </form>
                  </div>
                ) : (
                  <form action={teachCourse}>
                    {hidden(c.id)}
                    <Button type="submit" size="sm">
                      {t.teach.iTeach}
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="p-6 text-[15px] text-slate-600">{t.teach.none}</Card>
      )}
      <p className="mt-5 text-[14px] text-slate-500">{t.teach.missing}</p>
    </div>
  );
}
