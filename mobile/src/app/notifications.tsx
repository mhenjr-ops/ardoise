import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, type IconName } from '@/components/ndop';
import { Text } from '@/components/text';
import { Card, Empty, Loading, Row, Screen, colors, fonts } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { notificationText, type AppNotification, type NotificationKind } from '@/lib/engage';
import { timeAgo, useI18n } from '@/lib/i18n';
import { routeForLink } from '@/lib/inbox';
import { supabase } from '@/lib/supabase';

const KIND_ICON: Record<NotificationKind, { icon: IconName; bg: string; fg: string }> = {
  announcement: { icon: 'bell', bg: colors.ochreSoft, fg: colors.ochreText },
  assignment: { icon: 'calendar', bg: colors.brandSoft, fg: colors.board },
  grade: { icon: 'cap', bg: colors.leafSoft, fg: colors.leaf },
  submission: { icon: 'check', bg: colors.brandSoft, fg: colors.board },
  message: { icon: 'inbox', bg: colors.infoSoft, fg: colors.info },
  discussion: { icon: 'chat', bg: colors.dangerSoft, fg: colors.danger },
  results: { icon: 'cap', bg: colors.ochreSoft, fg: colors.ochreText },
  attendance: { icon: 'check', bg: colors.leafSoft, fg: colors.leaf },
};

export default function NotificationsScreen() {
  const { session } = useAuth();
  const { t, locale } = useI18n();
  const [list, setList] = useState<AppNotification[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!userId) return;
    setNow(Date.now());
    const { data } = await supabase
      .from('notifications')
      .select('id, kind, data, link, course_id, created_at, read_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(60);
    setList((data ?? []) as AppNotification[]);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function open(n: AppNotification) {
    if (!n.read_at) {
      setList((l) => l?.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)) ?? null);
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id);
    }
    const target = routeForLink(n.link);
    if (target) router.push(target);
  }

  async function markAll() {
    if (!userId) return;
    const stamp = new Date().toISOString();
    setList((l) => l?.map((x) => ({ ...x, read_at: x.read_at ?? stamp })) ?? null);
    await supabase.from('notifications').update({ read_at: stamp }).eq('user_id', userId).is('read_at', null);
  }

  if (!list) return <Loading />;
  const unread = list.some((n) => !n.read_at);

  return (
    <Screen>
      <Stack.Screen options={{ title: t.notifications }} />
      <View style={s.actions}>
        <Pressable onPress={() => router.push('/notification-settings')} hitSlop={8} style={({ pressed }) => [s.markAll, pressed && { opacity: 0.7 }]}>
          <Icon name="phone" size={16} color={colors.board} strokeWidth={2.2} />
          <Text style={s.markAllText}>{t.phoneAlerts}</Text>
        </Pressable>
        {unread ? (
          <Pressable onPress={markAll} hitSlop={8} style={({ pressed }) => [s.markAll, pressed && { opacity: 0.7 }]}>
            <Icon name="check" size={16} color={colors.board} strokeWidth={2.2} />
            <Text style={s.markAllText}>{t.markAllRead}</Text>
          </Pressable>
        ) : null}
      </View>
      {list.length === 0 ? (
        <Empty text={t.noNotifications} />
      ) : (
        <Card>
          {list.map((n) => {
            const k = KIND_ICON[n.kind] ?? KIND_ICON.announcement;
            return (
              <Row key={n.id} onPress={() => open(n)} style={[{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }, !n.read_at && { backgroundColor: '#FFF9EC' }]}>
                <View style={[s.icon, { backgroundColor: k.bg }]}>
                  <Icon name={k.icon} color={k.fg} size={19} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[s.text, !n.read_at && { fontFamily: fonts.bold }]}>{notificationText(t.notif, locale, n)}</Text>
                  {n.kind === 'message' && n.data.preview ? (
                    <Text numberOfLines={2} style={s.preview}>
                      {String(n.data.preview)}
                    </Text>
                  ) : null}
                  <Text style={s.when}>{timeAgo(locale, n.created_at, now)}</Text>
                </View>
                {!n.read_at ? <View style={s.dot} /> : null}
              </Row>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 15.5, fontFamily: fonts.body, color: colors.text, lineHeight: 21 },
  preview: { fontSize: 14.5, fontFamily: fonts.body, color: colors.muted, lineHeight: 20 },
  when: { fontSize: 13, fontFamily: fonts.body, color: colors.muted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  markAll: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.brandSoft },
  markAllText: { fontFamily: fonts.bold, fontSize: 14.5, color: colors.board },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.ochre, marginTop: 6 },
});
