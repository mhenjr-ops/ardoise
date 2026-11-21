import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/ndop';
import { Text } from '@/components/text';
import { Avatar, Button, Card, Empty, Input, Row, colors, fonts } from '@/components/ui';
import { fmt, timeAgo, useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

type TopicRow = {
  id: string;
  title: string;
  pinned: boolean;
  locked: boolean;
  reply_count: number;
  last_activity_at: string;
  author: { full_name: string; email: string } | { full_name: string; email: string }[] | null;
};

export function CourseDiscussions({ courseId }: { courseId: string }) {
  const { t, locale } = useI18n();
  const [topics, setTopics] = useState<TopicRow[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setNow(Date.now());
    const { data } = await supabase
      .from('discussion_topics')
      .select('id, title, pinned, locked, reply_count, last_activity_at, author:profiles(full_name, email)')
      .eq('course_id', courseId)
      .order('pinned', { ascending: false })
      .order('last_activity_at', { ascending: false });
    setTopics((data ?? []) as TopicRow[]);
  }, [courseId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function create() {
    if (!title.trim()) return;
    setBusy(true);
    setError('');
    const { data, error: e } = await supabase
      .from('discussion_topics')
      .insert({ course_id: courseId, title: title.trim(), body: body.trim() })
      .select('id')
      .single();
    setBusy(false);
    if (e || !data) {
      setError(t.error);
      return;
    }
    setTitle('');
    setBody('');
    setComposing(false);
    router.push({ pathname: '/discussion/[id]', params: { id: data.id as string } });
  }

  if (!topics) return null;

  return (
    <>
      {composing ? (
        <Card style={{ padding: 16, gap: 12 }}>
          <Text style={s.heading}>{t.newTopic}</Text>
          <Input label={t.topicTitle} value={title} onChangeText={setTitle} maxLength={200} />
          <Input label={t.topicBody} value={body} onChangeText={setBody} multiline />
          {error ? <Text style={{ color: colors.danger, fontFamily: fonts.bold }}>{error}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button title={t.cancel} variant="secondary" onPress={() => setComposing(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title={t.post} onPress={create} loading={busy} disabled={!title.trim()} />
            </View>
          </View>
        </Card>
      ) : (
        <Button title={t.newTopic} variant="secondary" onPress={() => setComposing(true)} />
      )}
      {topics.length === 0 ? (
        <Empty text={t.noTopics} />
      ) : (
        <Card>
          {topics.map((tp) => {
            const a = Array.isArray(tp.author) ? tp.author[0] : tp.author;
            const name = a ? a.full_name || a.email : '—';
            return (
              <Row
                key={tp.id}
                onPress={() => router.push({ pathname: '/discussion/[id]', params: { id: tp.id } })}
                style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}
              >
                <Avatar name={name} size={36} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {tp.pinned ? <Icon name="pin" size={15} color={colors.ochreText} /> : null}
                    {tp.locked ? <Icon name="lock" size={15} color={colors.muted} /> : null}
                    <Text numberOfLines={2} style={s.title}>
                      {tp.title}
                    </Text>
                  </View>
                  <Text style={s.meta}>
                    {name} · {fmt(t.lastActivity, { when: timeAgo(locale, tp.last_activity_at, now) })}
                  </Text>
                </View>
                <View style={s.count}>
                  <Icon name="chat" size={15} color={colors.board} />
                  <Text style={s.countText}>{tp.reply_count}</Text>
                </View>
              </Row>
            );
          })}
        </Card>
      )}
    </>
  );
}

const s = StyleSheet.create({
  heading: { fontSize: 19, fontFamily: fonts.display, color: colors.text },
  title: { flex: 1, fontSize: 16.5, fontFamily: fonts.bold, color: colors.text },
  meta: { fontSize: 14, color: colors.muted, fontFamily: fonts.body },
  count: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.brandSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  countText: { fontFamily: fonts.bold, color: colors.board, fontSize: 14 },
});
