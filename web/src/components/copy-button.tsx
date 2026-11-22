"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copies a value (an invitation link) and says so for a moment. */
export function CopyButton({ value, label, copiedLabel }: { value: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt(label, value);
        }
      }}
      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[10px] bg-ardoise px-4 text-[14.5px] font-semibold text-chalk hover:bg-brand-600"
    >
      {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
      {copied ? copiedLabel : label}
    </button>
  );
}

/** An invitation link ready to send: the link, a copy button and a WhatsApp share. */
export function ShareLink({
  url,
  message,
  labels,
}: {
  url: string;
  message: string;
  labels: { copy: string; copied: string; whatsapp: string };
}) {
  return (
    <div className="space-y-3">
      <p className="break-all rounded-xl bg-paper px-4 py-3 font-mono text-[13.5px] text-slate-800 ring-1 ring-slate-200">{url}</p>
      <div className="flex flex-wrap gap-2">
        <CopyButton value={url} label={labels.copy} copiedLabel={labels.copied} />
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${message}\n${url}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-slate-300 bg-paper px-4 text-[14.5px] font-semibold text-slate-800 hover:bg-white"
        >
          {labels.whatsapp}
        </a>
      </div>
    </div>
  );
}
