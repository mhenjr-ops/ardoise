"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";
import { recordFiles } from "./actions";

const MAX_BYTES = 50 * 1024 * 1024;

function safeName(name: string) {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot).toLowerCase().replace(/[^.a-z0-9]/g, "") : "";
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .slice(0, 60);
  return `${base || "fichier"}${ext}`;
}

export function FileUploader({
  courseId,
  folders,
  labels,
}: {
  courseId: string;
  folders: string[];
  labels: { folder: string; folderHint: string; choose: string; upload: string; uploading: string; tooBig: string; uploaded: string; error: string };
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<File[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const folder = String(new FormData(e.currentTarget).get("folder") ?? "");
    if (!picked.length) return;
    if (picked.some((f) => f.size > MAX_BYTES)) {
      setMessage({ ok: false, text: labels.tooBig });
      return;
    }
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const done: Array<{ name: string; path: string; size: number; type: string }> = [];
    for (const file of picked) {
      const path = `${courseId}/${crypto.randomUUID()}/${safeName(file.name)}`;
      const { error } = await supabase.storage.from("course-files").upload(path, file, { contentType: file.type || undefined });
      if (!error) done.push({ name: file.name, path, size: file.size, type: file.type });
    }
    const res = done.length ? await recordFiles({ courseId, folder, files: done }) : { ok: false };
    setBusy(false);
    setPicked([]);
    if (inputRef.current) inputRef.current.value = "";
    setMessage(res.ok && done.length === picked.length ? { ok: true, text: labels.uploaded } : { ok: false, text: labels.error });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-8 text-center hover:border-ardoise">
        <UploadCloud size={28} className="text-slate-400" aria-hidden />
        <span className="text-[15px] font-semibold text-slate-700">{picked.length ? picked.map((f) => f.name).join(", ") : labels.choose}</span>
        <input ref={inputRef} type="file" multiple className="sr-only" onChange={(e) => setPicked([...(e.target.files ?? [])])} />
      </label>
      <Field label={labels.folder} hint={labels.folderHint}>
        <Input name="folder" list="folders" maxLength={80} />
        <datalist id="folders">
          {folders.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </Field>
      {message ? <p className={`text-[14px] font-semibold ${message.ok ? "text-leaf-700" : "text-terracotta-600"}`}>{message.text}</p> : null}
      <Button type="submit" disabled={busy || !picked.length}>
        {busy ? labels.uploading : labels.upload}
      </Button>
    </form>
  );
}
