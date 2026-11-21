import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';
import { Icon } from '@/components/ndop';
import { Text } from '@/components/text';
import { Avatar, Loading, colors, fonts } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatDay, formatTime, useI18n, watDayKey } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

type Message = { id: string; sender_id: string | null; body: string; created_at: string };
type Thread = { subject: string; people: Map<string, string>; messages: Message[] };

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { t, locale } = useI18n();
  const [thread, setThread] = useState<Thread | null>(null);
  const [missing, setMissing] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const scroller = useRef<ScrollViewInstance>(null);
  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!userId || !id) return;
    const [{ data: conv }, { data: people }, { data: msgs }] = await Promise.all([
      supabase.from('conversations').select('subject').eq('id', id).maybeSingle(),
      supabase.from('conversation_participants').select('user:profiles(id, full_name, email)').eq('conversation_id', id),
      supabase.from('messages').select('id, sender_id, body, created_at').eq('conversation_id', id).order('created_at'),
    ]);
    if (!conv) {
      setMissing(true);
      return;
    }
    const map = new Map<string, string>();
    for (const p of people ?? []) {
      const u = (Array.isArray(p.user) ? p.user[0] : p.user) as { id: string; full_name: string; email: string } | null;
      if (u) map.set(u.id, u.full_name || u.email);
    }
    setThread({ subject: conv.subject as string, people: map, messages: (msgs ?? []) as Message[] });
    supabase.rpc('mark_conversation_read', { p_conversation: id }).then(() => {});
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
    setFailed(false);
    const { error } = await supabase.from('messages').insert({ conversation_id: id, body });
    setSending(false);
    if (error) {
      setFailed(true);
      return;
    }
    setDraft('');
    await load();
  }

  if (missing) return <Text style={{ padding: 24, color: colors.muted }}>{t.error}</Text>;
  if (!thread) return <Loading />;

  const others = [...thread.people.entries()].filter(([pid]) => pid !== userId).map(([, n]) => n);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: thread.subject || t.noSubject }} />
      <View style={s.people}>
        <Text numberOfLines={1} style={s.peopleText}>
          {others.join(', ')}
        </Text>
      </View>
      <ScrollView
        ref={scroller}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
      >
        {thread.messages.map((m, i) => {
          const mine = m.sender_id === userId;
          const day = watDayKey(m.created_at);
          const showDay = i === 0 || day !== watDayKey(thread.messages[i - 1].created_at);
          const name = m.sender_id ? (thread.people.get(m.sender_id) ?? '—') : '—';
          return (
            <View key={m.id} style={{ gap: 6 }}>
              {showDay ? (
                <Text style={s.day}>{formatDay(locale, day, { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
              ) : null}
              <View style={[s.line, mine && { justifyContent: 'flex-end' }]}>
                {!mine ? <Avatar name={name} size={30} /> : null}
                <View style={[s.bubble, mine ? s.mine : s.theirs]}>
                  {!mine && others.length > 1 ? <Text style={s.sender}>{name}</Text> : null}
                  <Text style={[s.body, mine && { color: colors.chalk }]}>{m.body}</Text>
                  <Text style={[s.time, mine && { color: 'rgba(248,243,234,0.6)' }]}>{formatTime(locale, m.created_at)}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
      {failed ? <Text style={s.failed}>{t.error}</Text> : null}
      <View style={s.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={t.replyPlaceholder}
          placeholderTextColor="#A8977D"
          multiline
          style={s.input}
          maxLength={10000}
        />
        <Pressable
          onPress={send}
          disabled={sending || !draft.trim()}
          style={({ pressed }) => [s.send, (sending || !draft.trim()) && { opacity: 0.45 }, pressed && { backgroundColor: '#2A4D45' }]}
          accessibilityRole="button"
          accessibilityLabel={t.send}
        >
          <Icon name="send" color={colors.chalk} size={20} strokeWidth={2.1} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  people: { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 16, paddingVertical: 10 },
  peopleText: { fontFamily: fonts.medium, color: colors.muted, fontSize: 14.5 },
  day: { alignSelf: 'center', fontFamily: fonts.bold, fontSize: 13, color: colors.muted, marginTop: 6 },
  line: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubble: { maxWidth: '80%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  mine: { backgroundColor: colors.board, borderBottomRightRadius: 6 },
  theirs: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 6 },
  sender: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.danger },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.text },
  time: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, alignSelf: 'flex-end' },
  failed: { color: colors.danger, fontFamily: fonts.bold, paddingHorizontal: 16, paddingBottom: 6 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    padding: 10,
    paddingBottom: 14,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
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
