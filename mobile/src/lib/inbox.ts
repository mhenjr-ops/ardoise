import { supabase } from '@/lib/supabase';

export type ConversationSummary = {
  id: string;
  subject: string;
  last_message_at: string;
  unread: boolean;
  others: { id: string; name: string }[];
  preview: string;
  lastFromMe: boolean;
  course: string | null;
};

type Person = { id: string; full_name: string; email: string };

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/** The user's conversations, newest first (same rules as the web inbox). */
export async function loadConversations(userId: string): Promise<ConversationSummary[]> {
  const { data: mine } = await supabase
    .from('conversation_participants')
    .select('conversation_id, last_read_at, conversation:conversations(id, subject, last_message_at, course:courses(code))')
    .eq('user_id', userId);
  const convs = (mine ?? [])
    .map((r) => ({
      last_read_at: r.last_read_at as string | null,
      conv: one(r.conversation as never) as { id: string; subject: string; last_message_at: string; course: { code: string } | { code: string }[] | null } | null,
    }))
    .filter((r): r is { last_read_at: string | null; conv: NonNullable<typeof r.conv> } => !!r.conv);
  if (!convs.length) return [];
  const ids = convs.map((c) => c.conv.id);

  const [{ data: people }, { data: msgs }] = await Promise.all([
    supabase.from('conversation_participants').select('conversation_id, user:profiles(id, full_name, email)').in('conversation_id', ids),
    supabase
      .from('messages')
      .select('conversation_id, sender_id, body, created_at')
      .in('conversation_id', ids)
      .order('created_at', { ascending: false })
      .limit(Math.min(1000, ids.length * 20)),
  ]);

  const last = new Map<string, { sender_id: string | null; body: string; created_at: string }>();
  for (const m of msgs ?? []) if (!last.has(m.conversation_id)) last.set(m.conversation_id, m);

  const others = new Map<string, { id: string; name: string }[]>();
  for (const p of people ?? []) {
    const u = one(p.user as never) as Person | null;
    if (!u || u.id === userId) continue;
    others.set(p.conversation_id, [...(others.get(p.conversation_id) ?? []), { id: u.id, name: u.full_name || u.email }]);
  }

  return convs
    .map(({ conv, last_read_at }) => {
      const m = last.get(conv.id);
      return {
        id: conv.id,
        subject: conv.subject,
        last_message_at: conv.last_message_at,
        unread: !!m && m.sender_id !== userId && (!last_read_at || m.created_at > last_read_at),
        others: others.get(conv.id) ?? [],
        preview: m?.body ?? '',
        lastFromMe: m?.sender_id === userId,
        course: one(conv.course)?.code ?? null,
      };
    })
    .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
}

/** Where a notification's web link leads inside the phone app. */
export function routeForLink(link: string | null):
  | { pathname: '/inbox/[id]' | '/discussion/[id]' | '/assignment/[id]' | '/course/[id]'; params: { id: string } }
  | '/results'
  | null {
  if (!link) return null;
  const path = link.split('?')[0];
  let m = path.match(/^\/inbox\/([0-9a-f-]{36})/);
  if (m) return { pathname: '/inbox/[id]', params: { id: m[1] } };
  m = path.match(/^\/courses\/[0-9a-f-]{36}\/discussions\/([0-9a-f-]{36})/);
  if (m) return { pathname: '/discussion/[id]', params: { id: m[1] } };
  m = path.match(/^\/courses\/[0-9a-f-]{36}\/assignments\/([0-9a-f-]{36})/);
  if (m) return { pathname: '/assignment/[id]', params: { id: m[1] } };
  m = path.match(/^\/courses\/([0-9a-f-]{36})/);
  if (m) return { pathname: '/course/[id]', params: { id: m[1] } };
  if (path.startsWith('/results')) return '/results';
  return null;
}
