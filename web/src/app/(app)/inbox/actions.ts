"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";
import { errorCode } from "@/lib/errors";

export async function sendNewMessage(formData: FormData) {
  const recipients = formData.getAll("to").map(String).filter(Boolean);
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!recipients.length) redirect("/inbox/new?error=pick");
  if (!body) redirect(`/inbox/new?error=invalid&to=${recipients.join(",")}`);
  const { supabase } = await actionSession();
  const { data, error } = await supabase.rpc("start_conversation", {
    p_recipients: recipients,
    p_subject: subject,
    p_body: body,
  });
  if (error || !data) redirect(`/inbox/new?error=${errorCode(error)}`);
  revalidatePath("/inbox");
  redirect(`/inbox/${data as string}`);
}

export async function replyToConversation(formData: FormData) {
  const conversationId = String(formData.get("conversation_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) redirect(`/inbox/${conversationId}`);
  const { supabase } = await actionSession();
  const { error } = await supabase.from("messages").insert({ conversation_id: conversationId, body });
  if (error) redirect(`/inbox/${conversationId}?error=forbidden`);
  revalidatePath("/inbox");
  revalidatePath(`/inbox/${conversationId}`);
  redirect(`/inbox/${conversationId}`);
}
