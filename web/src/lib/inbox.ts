import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export type ConversationSummary = {
  id: string;
  subject: string;
  last_message_at: string;
  unread: boolean;
  others: Array<{ id: string; name: string }>;
  preview: string;
  lastFromMe: boolean;
};

/** The user's conversations, newest first, with who's in them and the last message. */
export async function loadConversations(supabase: Client, userId: string): Promise<ConversationSummary[]> {
  const { data: mine } = await supabase
    .from("conversation_participants")
    .select("conversation_id, last_read_at, archived, conversation:conversations(id, subject, last_message_at)")
    .eq("user_id", userId);
  const rows = (mine ?? []).map((r) => ({
    last_read_at: r.last_read_at as string | null,
    conv: (Array.isArray(r.conversation) ? r.conversation[0] : r.conversation) as
      | { id: string; subject: string; last_message_at: string }
      | null,
  }));
  const convs = rows.filter((r) => r.conv).map((r) => ({ ...r, conv: r.conv! }));
  if (!convs.length) return [];
  const ids = convs.map((c) => c.conv.id);

  const [{ data: people }, { data: msgs }] = await Promise.all([
    supabase.from("conversation_participants").select("conversation_id, user:profiles(id, full_name, email)").in("conversation_id", ids),
    supabase
      .from("messages")
      .select("conversation_id, sender_id, body, created_at")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false })
      .limit(Math.min(1000, ids.length * 20)),
  ]);

  const lastByConv = new Map<string, { sender_id: string | null; body: string; created_at: string }>();
  for (const m of msgs ?? []) if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);

  const othersByConv = new Map<string, Array<{ id: string; name: string }>>();
  for (const p of people ?? []) {
    const u = (Array.isArray(p.user) ? p.user[0] : p.user) as { id: string; full_name: string; email: string } | null;
    if (!u || u.id === userId) continue;
    const list = othersByConv.get(p.conversation_id) ?? [];
    list.push({ id: u.id, name: u.full_name || u.email });
    othersByConv.set(p.conversation_id, list);
  }

  return convs
    .map(({ conv, last_read_at }) => {
      const last = lastByConv.get(conv.id);
      return {
        id: conv.id,
        subject: conv.subject,
        last_message_at: conv.last_message_at,
        unread: !!last && last.sender_id !== userId && (!last_read_at || last.created_at > last_read_at),
        others: othersByConv.get(conv.id) ?? [],
        preview: last?.body ?? "",
        lastFromMe: last?.sender_id === userId,
      };
    })
    .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
}
