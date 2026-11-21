import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from '@/components/ndop';
import { Text } from '@/components/text';
import { Avatar, Card, Empty, Loading, Row, Screen, colors, fonts } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { timeAgo, useI18n } from '@/lib/i18n';
import { loadConversations, type ConversationSummary } from '@/lib/inbox';

export default function InboxScreen() {
  const { session } = useAuth();
  const { t, locale } = useI18n();
  const [list, setList] = useState<ConversationSummary[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!userId) return;
    setNow(Date.now());
    setList(await loadConversations(userId));
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!list) return <Loading />;

  return (
    <View style={{ flex: 1 }}>
      <Screen
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          await load();
          setRefreshing(false);
        }}
      >
        {list.length === 0 ? (
          <Empty text={t.inboxEmpty} />
        ) : (
          <Card>
            {list.map((c) => {
              const names = c.others.map((o) => o.name).join(', ') || t.you;
              return (
                <Row
                  key={c.id}
                  onPress={() => router.push({ pathname: '/inbox/[id]', params: { id: c.id } })}
                  style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}
                >
                  <Avatar name={c.others[0]?.name ?? names} size={42} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text numberOfLines={1} style={[s.names, c.unread && { fontFamily: fonts.heavy }]}>
                        {names}
                      </Text>
                      <Text style={s.when}>{timeAgo(locale, c.last_message_at, now)}</Text>
                    </View>
                    <Text numberOfLines={1} style={[s.subject, c.unread && { color: colors.text }]}>
                      {c.course ? `${c.course} · ` : ''}
                      {c.subject || t.noSubject}
                    </Text>
                    <Text numberOfLines={2} style={s.preview}>
                      {c.lastFromMe ? `${t.you} : ` : ''}
                      {c.preview}
                    </Text>
                  </View>
                  {c.unread ? <View style={s.unread} /> : null}
                </Row>
              );
            })}
          </Card>
        )}
      </Screen>
      <Pressable
        onPress={() => router.push('/inbox/new')}
        style={({ pressed }) => [s.fab, pressed && { backgroundColor: '#E39E17' }]}
        accessibilityRole="button"
        accessibilityLabel={t.newMessage}
      >
        <Icon name="send" color="#12100C" size={20} strokeWidth={2.1} />
        <Text style={s.fabText}>{t.newMessage}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  names: { flex: 1, fontSize: 16.5, fontFamily: fonts.bold, color: colors.text },
  when: { fontSize: 13, color: colors.muted, fontFamily: fonts.body },
  subject: { fontSize: 15, fontFamily: fonts.bold, color: '#453D33' },
  preview: { fontSize: 14.5, color: colors.muted, fontFamily: fonts.body, lineHeight: 20 },
  unread: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ochre, marginTop: 6 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.ochre,
    paddingHorizontal: 18,
    height: 52,
    borderRadius: 26,
    shadowColor: '#12100C',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fabText: { fontFamily: fonts.heavy, fontSize: 16, color: '#12100C' },
});
