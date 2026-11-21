import Link from "next/link";
import { ExternalLink, FileText, ListChecks } from "lucide-react";
import { getCourseContext } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { Badge, Button, Card, Disclosure, Empty, Field, Flash, Input } from "@/components/ui";
import type { Module, ModuleItem } from "@/lib/types";
import { createModule, deleteModule, removeItem, toggleModule } from "./actions";
import { AddItemForm } from "./add-item-form";

export default async function ModulesPage({ params, searchParams }: PageProps<"/courses/[courseId]/modules">) {
  const { courseId } = await params;
  const { error } = await searchParams;
  const [{ supabase, course, isStaff }, { t }] = await Promise.all([getCourseContext(courseId), getI18n()]);

  const [{ data: modulesData }, { data: itemsData }, { data: assignmentsData }] = await Promise.all([
    supabase.from("modules").select("id, course_id, title, position, published").eq("course_id", course.id).order("position"),
    supabase
      .from("module_items")
      .select("id, module_id, item_type, title, page_id, assignment_id, url, position")
      .eq("course_id", course.id)
      .order("position"),
    isStaff
      ? supabase.from("assignments").select("id, title").eq("course_id", course.id).order("created_at")
      : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
  ]);
  const modules = (modulesData ?? []) as Module[];
  const items = (itemsData ?? []) as ModuleItem[];
  const assignments = (assignmentsData ?? []) as Array<{ id: string; title: string }>;

  const labels = {
    addItem: t.modules.addItem,
    itemType: t.modules.itemType,
    page: t.modules.page,
    assignment: t.modules.assignment,
    link: t.modules.link,
    header: t.modules.header,
    url: t.modules.url,
    title: t.common.title,
    body: t.modules.newPageBody,
    add: t.common.add,
  };

  function itemHref(item: ModuleItem) {
    if (item.item_type === "page") return `/courses/${course.id}/pages/${item.page_id}`;
    if (item.item_type === "assignment") return `/courses/${course.id}/assignments/${item.assignment_id}`;
    return item.url ?? "#";
  }

  return (
    <div className="space-y-4">
      <Flash error={errorText(t, typeof error === "string" ? error : null)} />

      {isStaff ? (
        <Disclosure summary={t.modules.newModule}>
          <form action={createModule} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <input type="hidden" name="course_id" value={course.id} />
            <div className="flex-1">
              <Field label={t.modules.moduleTitle}>
                <Input name="title" required placeholder="Semaine 1 — Introduction" />
              </Field>
            </div>
            <Button type="submit">{t.common.create}</Button>
          </form>
        </Disclosure>
      ) : null}

      {modules.length === 0 ? <Empty>{t.modules.empty}</Empty> : null}

      {modules.map((m) => {
        const moduleItems = items.filter((i) => i.module_id === m.id);
        return (
          <Card key={m.id} className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-slate-900">{m.title}</h2>
                {isStaff && !m.published ? <Badge tone="warn">{t.common.unpublished}</Badge> : null}
              </div>
              {isStaff ? (
                <div className="flex items-center gap-3">
                  <form action={toggleModule}>
                    <input type="hidden" name="course_id" value={course.id} />
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="published" value={String(m.published)} />
                    <button type="submit" className="text-xs font-medium text-brand-700 hover:underline">
                      {m.published ? t.common.unpublish : t.common.publish}
                    </button>
                  </form>
                  <form action={deleteModule}>
                    <input type="hidden" name="course_id" value={course.id} />
                    <input type="hidden" name="id" value={m.id} />
                    <button type="submit" className="text-xs text-red-600 hover:underline">
                      {t.common.delete}
                    </button>
                  </form>
                </div>
              ) : null}
            </div>

            {moduleItems.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">{t.modules.emptyModule}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {moduleItems.map((item) =>
                  item.item_type === "header" ? (
                    <li key={item.id} className="flex items-center justify-between bg-white px-5 pb-1 pt-4">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.title}</span>
                      {isStaff ? <RemoveItem courseId={course.id} id={item.id} label={t.modules.remove} /> : null}
                    </li>
                  ) : (
                    <li key={item.id} className="flex items-center gap-3 px-5 py-3">
                      {item.item_type === "page" ? (
                        <FileText size={18} className="shrink-0 text-slate-400" aria-hidden />
                      ) : item.item_type === "assignment" ? (
                        <ListChecks size={18} className="shrink-0 text-brand-600" aria-hidden />
                      ) : (
                        <ExternalLink size={18} className="shrink-0 text-sky-600" aria-hidden />
                      )}
                      {item.item_type === "link" ? (
                        <a
                          href={itemHref(item)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 flex-1 truncate text-sm text-slate-800 hover:text-brand-700 hover:underline"
                        >
                          {item.title}
                        </a>
                      ) : (
                        <Link
                          href={itemHref(item)}
                          className="min-w-0 flex-1 truncate text-sm text-slate-800 hover:text-brand-700 hover:underline"
                        >
                          {item.title}
                        </Link>
                      )}
                      {isStaff ? <RemoveItem courseId={course.id} id={item.id} label={t.modules.remove} /> : null}
                    </li>
                  ),
                )}
              </ul>
            )}

            {isStaff ? (
              <details className="border-t border-slate-100">
                <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-brand-700">
                  + {t.modules.addItem}
                </summary>
                <div className="px-5 pb-4">
                  <AddItemForm courseId={course.id} moduleId={m.id} assignments={assignments} labels={labels} />
                </div>
              </details>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

function RemoveItem({ courseId, id, label }: { courseId: string; id: string; label: string }) {
  return (
    <form action={removeItem}>
      <input type="hidden" name="course_id" value={courseId} />
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-xs text-slate-400 hover:text-red-600">
        {label}
      </button>
    </form>
  );
}
