import Link from "next/link";
import { Check } from "lucide-react";
import type { createClient } from "@/lib/supabase/server";
import { fmt } from "@/lib/i18n/messages-engage";
import type { Messages } from "@/lib/i18n/messages";

type Client = Awaited<ReturnType<typeof createClient>>;

/** The owner's and admin's path from an empty school to one that's running. */
export async function SetupChecklist({ supabase, institution, t }: { supabase: Client; institution: { id: string; name: string }; t: Messages }) {
  const inst = institution.id;
  const head = { count: "exact" as const, head: true };
  const [deps, sems, staff, roster, courses, teaching] = await Promise.all([
    supabase.from("departments").select("id", head).eq("institution_id", inst),
    supabase.from("semesters").select("id", head).eq("institution_id", inst),
    supabase.from("memberships").select("id", head).eq("institution_id", inst).in("role", ["registrar", "dean", "hod", "teacher"]),
    supabase.from("student_roster").select("id", head).eq("institution_id", inst),
    supabase.from("courses").select("id", head).eq("institution_id", inst),
    supabase.from("enrollments").select("id", head).eq("institution_id", inst).eq("role", "teacher"),
  ]);
  const steps = [
    { label: t.home.stepStructure, done: (deps.count ?? 0) > 0, href: "/admin/structure" },
    { label: t.home.stepYear, done: (sems.count ?? 0) > 0, href: "/admin/structure" },
    { label: t.home.stepStaff, done: (staff.count ?? 0) > 0, href: "/admin/people" },
    { label: t.home.stepStudents, done: (roster.count ?? 0) > 0, href: "/admin/upload" },
    { label: t.home.stepCourses, done: (courses.count ?? 0) > 0 && (teaching.count ?? 0) > 0, href: "/admin/upload" },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;

  return (
    <section className="mb-8 rounded-[22px] border border-ochre-200 bg-ochre-50/60 p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-2xl font-semibold">{fmt(t.home.setupTitle, { institution: institution.name })}</h2>
          <p className="text-[15px] text-slate-600">{t.home.setupBody}</p>
        </div>
        <p className="num font-display text-xl font-semibold text-ochre-800">
          {done}/{steps.length}
        </p>
      </div>
      <ol className="mt-5 grid gap-2 md:grid-cols-5">
        {steps.map((s, i) => (
          <li key={s.label}>
            <Link
              href={s.href}
              className={`flex h-full items-start gap-3 rounded-2xl p-3.5 ring-1 transition-colors ${
                s.done ? "bg-paper/60 text-slate-500 ring-slate-200" : "bg-paper text-slate-900 ring-ochre-200 hover:ring-ardoise"
              }`}
            >
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-bold ${
                  s.done ? "bg-leaf-500 text-white" : "bg-ardoise text-chalk"
                }`}
              >
                {s.done ? <Check size={15} aria-hidden /> : i + 1}
              </span>
              <span className="text-[14px] font-semibold leading-snug">{s.label}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
