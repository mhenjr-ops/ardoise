"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Textarea } from "@/components/ui";
import { recordSubmission } from "./actions";

const MAX_BYTES = 10 * 1024 * 1024;

type Labels = {
  textAnswer: string;
  file: string;
  submit: string;
  resubmit: string;
  uploading: string;
  fileTooBig: string;
  submitted: string;
  error: string;
};

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

export function SubmitForm({
  courseId,
  assignmentId,
  userId,
  allowText,
  allowFile,
  hasSubmission,
  defaultBody,
  labels,
}: {
  courseId: string;
  assignmentId: string;
  userId: string;
  allowText: boolean;
  allowFile: boolean;
  hasSubmission: boolean;
  defaultBody: string;
  labels: Labels;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const body = String(form.get("body") ?? "");
    const file = fileRef.current?.files?.[0] ?? null;

    let filePath: string | null = null;
    let fileName: string | null = null;

    if (file) {
      if (file.size > MAX_BYTES) {
        setMessage({ tone: "error", text: labels.fileTooBig });
        return;
      }
      setUploading(true);
      const supabase = createClient();
      filePath = `${courseId}/${assignmentId}/${userId}/${Date.now()}-${safeName(file.name)}`;
      fileName = file.name;
      const { error } = await supabase.storage
        .from("submissions")
        .upload(filePath, file, { contentType: file.type || undefined, upsert: false });
      setUploading(false);
      if (error) {
        setMessage({ tone: "error", text: labels.error });
        return;
      }
    }

    if (!body.trim() && !filePath) {
      setMessage({ tone: "error", text: labels.error });
      return;
    }

    startTransition(async () => {
      const result = await recordSubmission({ courseId, assignmentId, body, filePath, fileName });
      if (result.ok) {
        setMessage({ tone: "ok", text: labels.submitted });
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } else {
        setMessage({ tone: "error", text: labels.error });
      }
    });
  }

  const busy = uploading || pending;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {allowText ? (
        <Field label={labels.textAnswer}>
          <Textarea name="body" rows={6} defaultValue={defaultBody} />
        </Field>
      ) : null}
      {allowFile ? (
        <Field label={labels.file}>
          <input
            ref={fileRef}
            type="file"
            name="file"
            accept="application/pdf,image/*,.doc,.docx,.odt,.ppt,.pptx,.xls,.xlsx,.zip"
            className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
          />
        </Field>
      ) : null}
      {message ? (
        <p className={`text-sm ${message.tone === "ok" ? "text-brand-700" : "text-red-700"}`} role="status">
          {message.text}
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy ? labels.uploading : hasSubmission ? labels.resubmit : labels.submit}
      </Button>
    </form>
  );
}
