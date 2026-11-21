import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Icon, NdopPattern } from '@/components/ndop';
import { Text } from '@/components/text';
import { Avatar, Badge, Card, Loading, Screen, colors, fonts } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { timeAgo, useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

type Person = { id: string; full_name: string; email: string };
type Topic = {
  id: string;
  course_id: string;
  title: string;
  body: string;
  pinned: boolean;
  locked: boolean;
  created_at: string;
  author: Person | null;
  course: { code: string; color: string } | null;
};
type Reply = { id: string; parent_id: string | null; body: string; created_at: string; author: Person | null };

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}
const nameOf = (p: Person | null) => (p ? p.full_name || p.email : '—');

export default function DiscussionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { t, locale } = useI18n();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [missing, setMissing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [draft, setDraft] = useState('');
  const [parent, setParent] = useState<Reply | null>(null);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState('');
  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!id || !userId) return;
    setNow(Date.now());
    const [{ data: tp }, { data: rs }] = await Promise.all([
      supabase
        .from('discussion_topics')
        .select('id, course_id, title, body, pinned, locked, created_at, author:profiles(id, full_name, email), course:courses(code, color)')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('discussion_replies')
        .select('id, parent_id, body, created_at, author:profiles(id, full_name, email)')
        .eq('topic_id', id)
        .order('created_at'),
    ]);
    if (!tp) {
      setMissing(true);
      return;
    }
    setTopic({ ...(tp as never as Topic), author: one(tp.author as never), course: one(tp.course as never) });
    setReplies(((rs ?? []) as never[]).map((r: Reply) => ({ ...r, author: one(r.author as never) })));
  }, [id, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function send() {
    const body = draft.trim();
    if (!body || !id) return;
    setSending(true);
    setFailed('');
    const { error } = await supabase.from('discussion_replies').insert({ topic_id: id, parent_id: parent?.id ?? null, body });
    setSending(false);
    if (error) {
      setFailed(error.message.includes('topic_locked') ? t.lockedNote : t.error);
      return;
    }
    setDraft('');
    setParent(null);
    await load();
  }

  if (missing) return <Text style={{ padding: 24, color: colors.muted }}>{t.error}</Text>;
  if (!topic) return <Loading />;

  const roots = replies.filter((r) => !r.parent_id);
  const children = (rid: string) => replies.filter((r) => r.parent_id === rid);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: topic.course?.code ?? t.discussions }} />
      <Screen>
        <View style={[s.head, { backgroundColor: topic.course?.color ?? colors.board }]}>
          <NdopPattern opacity={0.16} size={70} />
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {topic.pinned ? <Badge label={t.pinned} tone="warn" /> : null}
            {topic.locked ? <Badge label={t.locked} tone="neutral" /> : null}
          </View>
          <Text style={s.title}>{topic.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Avatar name={nameOf(topic.author)} size={26} />
            <Text style={s.headMeta}>
              {nameOf(topic.author)} · {timeAgo(locale, topic.created_at, now)}
            </Text>
          </View>
        </View>
        {topic.body ? (
          <Card style={{ padding: 16 }}>
            <Text style={s.body}>{topic.body}</Text>
          </Card>
        ) : null}

        <Text style={s.count}>
          {replies.length} {t.replies}
        </Text>
        {roots.map((r) => (
          <View key={r.id} style={{ gap: 8 }}>
            <ReplyCard reply={r} now={now} onReply={topic.locked ? undefined : () => setParent(r)} />
            {children(r.id).map((c) => (
              <View key={c.id} style={s.child}>
                <ReplyCard reply={c} now={now} />
              </View>
            ))}
          </View>
        ))}
        {topic.locked ? (
          <View style={s.lockedNote}>
            <Icon name="lock" size={18} color={colors.muted} />
            <Text style={{ color: colors.muted, fontFamily: fonts.medium, flex: 1 }}>{t.lockedNote}</Text>
          </View>
        ) : null}
      </Screen>

      {!topic.locked ? (
        <View style={s.composerWrap}>
          {parent ? (
            <Pressable onPress={() => setParent(null)} style={s.replyingTo}>
              <Text numberOfLines={1} style={{ flex: 1, color: colors.muted, fontFamily: fonts.medium }}>
                ↳ {nameOf(parent.author)} : {parent.body}
              </Text>
              <Text style={{ color: colors.muted, fontFamily: fonts.bold }}>×</Text>
            </Pressable>
          ) : null}
          {failed ? <Text style={{ color: colors.danger, fontFamily: fonts.bold }}>{failed}</Text> : null}
          <View style={s.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={t.replyPlaceholder}
              placeholderTextColor="#A8977D"
              multiline
              style={s.input}
              maxLength={20000}
            />
            <Pressable
              onPress={send}
              disabled={sending || !draft.trim()}
              style={[s.send, (sending || !draft.trim()) && { opacity: 0.45 }]}
              accessibilityRole="button"
              accessibilityLabel={t.reply}
            >
              <Icon name="send" color={colors.chalk} size={20} strokeWidth={2.1} />
            </Pressable>
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function ReplyCard({ reply, now, onReply }: { reply: Reply; now: number; onReply?: () => void }) {
  const { t, locale } = useI18n();
  return (
    <Card style={{ padding: 14, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Avatar name={nameOf(reply.author)} size={28} />
        <Text style={s.author}>{nameOf(reply.author)}</Text>
        <Text style={s.when}>{timeAgo(locale, reply.created_at, now)}</Text>
      </View>
      <Text style={s.body}>{reply.body}</Text>
      {onReply ? (
        <Pressable onPress={onReply} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
          <Text style={s.replyLink}>{t.reply}</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  head: { borderRadius: 20, padding: 18, gap: 10, overflow: 'hidden' },
  title: { color: colors.chalk, fontFamily: fonts.display, fontSize: 24, lineHeight: 30 },
  headMeta: { color: 'rgba(248,243,234,0.8)', fontFamily: fonts.medium, fontSize: 14.5 },
  body: { fontSize: 16, lineHeight: 24, color: colors.text, fontFamily: fonts.body },
  count: { fontSize: 18, fontFamily: fonts.display, color: colors.text },
  child: { marginLeft: 22, borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: 10 },
  author: { flex: 1, fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  when: { fontSize: 13, color: colors.muted, fontFamily: fonts.body },
  replyLink: { fontFamily: fonts.bold, color: colors.danger, fontSize: 14.5 },
  lockedNote: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12 },
  composerWrap: { backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border, padding: 10, paddingBottom: 14, gap: 6 },
  replyingTo: { flexDirection: 'row', gap: 8, paddingHorizontal: 4 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 140,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D2C3AB',
    backgroundColor: colors.chalk,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.text,
  },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.board, alignItems: 'center', justifyContent: 'center' },
});
