import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, StyleSheet, Switch, View } from 'react-native';
import { Text } from '@/components/text';
import { Button, Card, Loading, Row, Screen, colors, fonts } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import type { NotificationKind } from '@/lib/engage';
import { useI18n } from '@/lib/i18n';
import { pushPermission, registerForPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';

const KINDS: NotificationKind[] = ['announcement', 'assignment', 'grade', 'results', 'message', 'discussion', 'attendance', 'submission'];

/** Which notifications make the phone ring. Muted kinds still appear under the bell. */
export default function NotificationSettingsScreen() {
  const { session } = useAuth();
  const { t, locale } = useI18n();
  const [muted, setMuted] = useState<Set<string> | null>(null);
  const [permission, setPermission] = useState<string | null>(null);
  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!userId) return;
    const [{ data }, status] = await Promise.all([supabase.from('push_mutes').select('kind').eq('user_id', userId), pushPermission()]);
    setMuted(new Set((data ?? []).map((r: { kind: string }) => r.kind)));
    setPermission(status);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Coming back from the phone's settings: register if notifications were just allowed.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      const status = await pushPermission();
      setPermission(status);
      if (status === 'granted') registerForPush(locale, t.pushChannel, false);
    });
    return () => sub.remove();
  }, [locale, t.pushChannel]);

  async function toggle(kind: string, on: boolean) {
    setMuted((m) => {
      const next = new Set(m);
      if (on) next.delete(kind);
      else next.add(kind);
      return next;
    });
    const { error } = await supabase.rpc('set_push_mute', { p_kind: kind, p_muted: !on });
    if (error) load();
  }

  async function turnOn() {
    if (permission === 'denied') {
      Linking.openSettings();
      return;
    }
    await registerForPush(locale, t.pushChannel, true);
    setPermission(await pushPermission());
  }

  if (!muted) return <Loading />;

  return (
    <Screen>
      <Stack.Screen options={{ title: t.phoneAlerts }} />
      <Text style={s.intro}>{t.phoneAlertsIntro}</Text>
      {permission === 'unsupported' ? (
        <Text style={s.note}>{t.pushUnsupported}</Text>
      ) : permission && permission !== 'granted' ? (
        <View style={s.off}>
          <Text style={s.note}>{t.pushOff}</Text>
          <Button title={permission === 'denied' ? t.openSettings : t.pushTurnOn} onPress={turnOn} />
        </View>
      ) : null}
      <Card>
        {KINDS.map((kind) => {
          const on = !muted.has(kind);
          return (
            <Row key={kind} onPress={() => toggle(kind, !on)} style={s.row}>
              <Text style={s.label}>{t.pushKinds[kind]}</Text>
              <Switch
                value={on}
                onValueChange={(v) => toggle(kind, v)}
                trackColor={{ false: colors.border, true: colors.board }}
                thumbColor={colors.chalk}
                accessibilityLabel={t.pushKinds[kind]}
              />
            </Row>
          );
        })}
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  intro: { fontFamily: fonts.body, fontSize: 15.5, lineHeight: 22, color: colors.muted },
  note: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21, color: colors.text },
  off: { gap: 12, padding: 16, borderRadius: 16, backgroundColor: colors.ochreSoft },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { flex: 1, fontFamily: fonts.body, fontSize: 16, color: colors.text },
});
