import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { NdopPattern, Ring } from '@/components/ndop';
import { Text } from '@/components/text';
import { Badge, Button, Card, Empty, Row, colors, fonts } from '@/components/ui';
import { fmt, formatDay, formatTime, useI18n, watDayKey } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

type Status = 'present' | 'late' | 'absent' | 'excused';
type Session = { id: string; starts_at: string; topic: string };
const TONE: Record<Status, 'success' | 'warn' | 'danger' | 'info'> = { present: 'success', late: 'warn', absent: 'danger', excused: 'info' };

/** Students see their own record; staff run roll call with a code shown on the board. */
export function CourseAttendance({ courseId, isStaff, userId }: { courseId: string; isStaff: boolean; userId: string }) {
  const { t, locale } = useI18n();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [records, setRecords] = useState<{ session_id: string; student_id: string; status: Status }[]>([]);
  const [students, setStudents] = useState(0);
  const [live, setLive] = useState<{ session: string; code: string; expires: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [{ data: ss }, { data: rs }, roster, codes] = await Promise.all([
      supabase.from('attendance_sessions').select('id, starts_at, topic').eq('course_id', courseId).order('starts_at', { ascending: false }),
      isStaff
        ? supabase.from('attendance_records').select('session_id, student_id, status').eq('course_id', courseId)
        : supabase.from('attendance_records').select('session_id, student_id, status').eq('course_id', courseId).eq('student_id', userId),
      isStaff
        ? supabase.from('enrollments').select('user_id', { count: 'exact', head: true }).eq('course_id', courseId).eq('role', 'student')
        : Promise.resolve({ count: 0 }),
      isStaff
        ? supabase.from('attendance_codes').select('session_id, code, expires_at').eq('course_id', courseId).gt('expires_at', new Date().toISOString())
        : Promise.resolve({ data: [] }),
    ]);
    setSessions((ss ?? []) as Session[]);
    setRecords((rs ?? []) as typeof records);
    setStudents(roster.count ?? 0);
    const c = ((codes.data ?? []) as { session_id: string; code: string; expires_at: string }[])[0];
    setLive(c ? { session: c.session_id, code: c.code, expires: c.expires_at } : null);
  }, [courseId, isStaff, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function start() {
    setBusy(true);
    setError('');
    const { data: session, error: e1 } = await supabase.from('attendance_sessions').insert({ course_id: courseId }).select('id').single();
    const { data: code, error: e2 } = session
      ? await supabase.rpc('open_checkin', { p_session: session.id, p_minutes: 10 })
      : { data: null, error: e1 };
    setBusy(false);
    if (e1 || e2 || !code) setError(t.error);
    await load();
  }

  async function close() {
    if (!live) return;
    setBusy(true);
    await supabase.rpc('close_checkin', { p_session: live.session });
    setBusy(false);
    await load();
  }

  if (!sessions) return null;

  const counted = (sid: string) => records.filter((r) => r.session_id === sid && r.status !== 'absent').length;
  const mine = (sid: string) => records.find((r) => r.session_id === sid && r.student_id === userId)?.status;
  const marked = records.filter((r) => r.student_id === userId);
  const rate = marked.length ? Math.round((marked.filter((r) => r.status !== 'absent').length / marked.length) * 100) : null;

  return (
    <>
      {isStaff ? (
        live ? (
          <View style={s.codeCard}>
            <NdopPattern opacity={0.12} />
            <Text style={s.codeHelp}>{t.showCode}</Text>
            <Text style={s.code}>{live.code.replace(/(\d{3})(\d{3})/, '$1 $2')}</Text>
            <Text style={s.codeHelp}>{fmt(t.codeValidUntil, { time: formatTime(locale, live.expires) })}</Text>
            <Text style={s.codeCount}>{fmt(t.checkedInCount, { n: counted(live.session), total: students })}</Text>
            <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
              <View style={{ flex: 1 }}>
                <Button title={t.refresh} variant="secondary" onPress={load} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title={t.closeCheckIn} variant="accent" onPress={close} loading={busy} />
              </View>
            </View>
          </View>
        ) : (
          <Button title={t.startCheckIn} variant="accent" onPress={start} loading={busy} />
        )
      ) : rate !== null ? (
        <Card style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Ring value={rate / 100} size={54} stroke={6} color={rate >= 80 ? colors.leaf : colors.danger} />
          <View style={{ flex: 1 }}>
            <Text style={s.rate}>{fmt(t.attendanceRate, { n: rate })}</Text>
          </View>
        </Card>
      ) : null}
      {error ? <Text style={{ color: colors.danger, fontFamily: fonts.bold }}>{error}</Text> : null}

      {sessions.length === 0 ? (
        <Empty text={t.noSessions} />
      ) : (
        <Card>
          {sessions.map((ss) => {
            const st = mine(ss.id);
            return (
              <Row key={ss.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.title}>
                    {formatDay(locale, watDayKey(ss.starts_at), { weekday: 'long', day: 'numeric', month: 'long' })}
                  </Text>
                  <Text style={s.meta}>{[formatTime(locale, ss.starts_at), ss.topic].filter(Boolean).join(' · ')}</Text>
                </View>
                {isStaff ? (
                  <Badge label={`${counted(ss.id)}/${students}`} tone="brand" />
                ) : st ? (
                  <Badge label={t.statuses[st]} tone={TONE[st]} />
                ) : null}
              </Row>
            );
          })}
        </Card>
      )}
    </>
  );
}

const s = StyleSheet.create({
  codeCard: { backgroundColor: colors.board, borderRadius: 22, padding: 20, alignItems: 'center', gap: 8, overflow: 'hidden' },
  codeHelp: { color: 'rgba(248,243,234,0.75)', fontFamily: fonts.medium, fontSize: 15 },
  code: { color: colors.chalk, fontFamily: fonts.displayBold, fontSize: 56, letterSpacing: 4, fontVariant: ['tabular-nums'] },
  codeCount: { color: colors.chalkYellow, fontFamily: fonts.bold, fontSize: 17, marginVertical: 6 },
  rate: { fontSize: 20, fontFamily: fonts.display, color: colors.text },
  title: { fontSize: 16, fontFamily: fonts.bold, color: colors.text },
  meta: { fontSize: 14, color: colors.muted, fontFamily: fonts.body },
});
