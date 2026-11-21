import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { Button, Card, Field, Flash, Input, Textarea } from "@/components/ui";
import { RecipientPicker, type Contact } from "@/components/inbox/recipient-picker";
import { sendNewMessage } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.inbox.compose };
}

export default async function NewMessagePage({ searchParams }: PageProps<"/inbox/new">) {
  const [{ supabase }, { t }] = await Promise.all([getSession(), getI18n()]);
  const sp = await searchParams;
  const { data } = await supabase.rpc("message_contacts");
  const contacts = (data ?? []) as Contact[];
  const initial = typeof sp.to === "string" ? sp.to.split(",").filter((id) => contacts.some((c) => c.id === id)) : [];
  const error = sp.error === "pick" ? t.inbox.pickRecipients : errorText(t, typeof sp.error === "string" ? sp.error : null);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/inbox" className="mb-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand-600 hover:underline">
        <ArrowLeft size={15} aria-hidden />
        {t.inbox.title}
      </Link>
      <h1 className="mb-6 font-display text-[2rem] font-semibold">{t.inbox.compose}</h1>
      <Flash error={error} />
      <Card className="p-5">
        <form action={sendNewMessage} className="space-y-4">
          <Field label={t.inbox.to} hint={t.inbox.toHelp}>
            <RecipientPicker contacts={contacts} initial={initial} labels={{ filter: t.inbox.filter, office: t.inbox.office }} />
          </Field>
          <Field label={t.inbox.subject}>
            <Input name="subject" maxLength={200} />
          </Field>
          <Field label={t.inbox.message}>
            <Textarea name="body" required className="min-h-40" />
          </Field>
          <Button type="submit" size="lg">
            {t.inbox.send}
          </Button>
        </form>
      </Card>
    </div>
  );
}
