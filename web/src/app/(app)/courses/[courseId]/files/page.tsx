import { Download, EyeOff, FileArchive, FileImage, FileSpreadsheet, FileText, FileVideo, Folder, Trash2 } from "lucide-react";
import { getCourseContext } from "@/lib/session";
import { getI18n } from "@/lib/i18n/server";
import { formatBytes, formatDate } from "@/lib/format";
import { Badge, Card, Disclosure, Empty } from "@/components/ui";
import type { CourseFile } from "@/lib/types";
import { deleteFile, toggleFile } from "./actions";
import { FileUploader } from "./uploader";

function iconFor(name: string) {
  if (/\.(png|jpe?g|gif|webp|heic|svg)$/i.test(name)) return FileImage;
  if (/\.(xlsx?|csv|ods)$/i.test(name)) return FileSpreadsheet;
  if (/\.(mp4|mov|webm|mkv)$/i.test(name)) return FileVideo;
  if (/\.(zip|rar|7z|tar|gz)$/i.test(name)) return FileArchive;
  return FileText;
}

export default async function FilesPage({ params }: PageProps<"/courses/[courseId]/files">) {
  const { courseId } = await params;
  const [{ supabase, course, isStaff }, { t, locale }] = await Promise.all([getCourseContext(courseId), getI18n()]);
  const { data } = await supabase
    .from("course_files")
    .select("id, course_id, folder, name, storage_path, size_bytes, mime_type, published, created_at")
    .eq("course_id", course.id)
    .order("folder")
    .order("name");
  const files = (data ?? []) as CourseFile[];

  // Signed links, valid for an hour, so downloads work on slow connections.
  const urls = new Map<string, string>();
  if (files.length) {
    const { data: signed } = await supabase.storage.from("course-files").createSignedUrls(
      files.map((f) => f.storage_path),
      3600,
      { download: true },
    );
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  const folders = [...new Set(files.map((f) => f.folder))].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));

  return (
    <div className="space-y-5">
      {isStaff ? (
        <Disclosure summary={t.files.upload} open={files.length === 0}>
          <FileUploader
            courseId={course.id}
            folders={folders.filter(Boolean)}
            labels={{
              folder: t.files.folder,
              folderHint: t.files.folderHint,
              choose: t.files.choose,
              upload: t.files.upload,
              uploading: t.files.uploading,
              tooBig: t.files.tooBig,
              uploaded: t.files.uploaded,
              error: t.errors.generic,
            }}
          />
        </Disclosure>
      ) : null}

      {files.length === 0 ? (
        <Empty>{t.files.empty}</Empty>
      ) : (
        folders.map((folder) => (
          <Card key={folder || "general"}>
            <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
              <Folder size={17} className="text-ochre-600" aria-hidden />
              <h2 className="text-[15px] font-bold">{folder || t.files.general}</h2>
            </div>
            <ul className="divide-y divide-slate-100">
              {files
                .filter((f) => f.folder === folder)
                .map((f) => {
                  const Icon = iconFor(f.name);
                  const url = urls.get(f.storage_path);
                  return (
                    <li key={f.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-ardoise">
                        <Icon size={18} aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate text-[15px] font-semibold">
                          {f.name}
                          {!f.published ? (
                            <Badge>
                              <EyeOff size={11} aria-hidden />
                              {t.files.hidden}
                            </Badge>
                          ) : null}
                        </p>
                        <p className="num text-[12.5px] text-slate-500">
                          {formatBytes(locale, Number(f.size_bytes))}, {formatDate(locale, f.created_at)}
                        </p>
                      </div>
                      {url ? (
                        <a href={url} className="grid h-9 w-9 place-items-center rounded-full text-brand-600 hover:bg-brand-50" aria-label={f.name}>
                          <Download size={17} aria-hidden />
                        </a>
                      ) : null}
                      {isStaff ? (
                        <>
                          <form action={toggleFile}>
                            <input type="hidden" name="course_id" value={course.id} />
                            <input type="hidden" name="id" value={f.id} />
                            <input type="hidden" name="published" value={String(!f.published)} />
                            <button type="submit" className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-100">
                              {f.published ? t.files.hide : t.files.show}
                            </button>
                          </form>
                          <form action={deleteFile}>
                            <input type="hidden" name="course_id" value={course.id} />
                            <input type="hidden" name="id" value={f.id} />
                            <button type="submit" className="grid h-9 w-9 place-items-center rounded-full text-slate-400 hover:bg-terracotta-50 hover:text-terracotta-600" aria-label={t.files.deleteFile}>
                              <Trash2 size={16} aria-hidden />
                            </button>
                          </form>
                        </>
                      ) : null}
                    </li>
                  );
                })}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
