import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Card, Empty, Loading, Lozenge, Row, Screen, colors, fonts } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { EVENT_COLORS, expandEvents, type CalendarEvent, type EventKind } from '@/lib/engage';
import { formatDay, formatTime, useI18n, watDayKey } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

const DAY = 86400000;
const SPAN = 14;

type Item = {
  key: string;
  day: string;
  start: string;
  end: string | null;
  title: string;
  sub: string;
  color: string;
  kind: EventKind | 'due';
  done?: boolean;
  href: { pathname: '/course/[id]' | '/assignment/[id]'; params: { id: string } } | null;
};

export default function AgendaScreen() {
  const { session } = useAuth();
  const { t, locale } = useI18n();
  const [items, setItems] = useState<Item[] | null>(null);
  const [today, setToday] = useState(() => watDayKey(Date.now()));
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!userId) return;
    const todayKey = watDayKey(Date.now());
    setToday(todayKey);
    const from = new Date(`${todayKey}T00:00:00+01:00`).getTime();
    const to = from + SPAN * DAY;
    const [{ data: rows }, { data: events }] = await Promise.all([
      supabase.from('enrollments').select('role, course:courses(id, code, color)').eq('user_id', userId),
      supabase
        .from('calendar_events')
        .select('id, course_id, title, location, kind, starts_at, ends_at, repeat_weekly_until')
        .lt('starts_at', new Date(to).toISOString())
        .or(`ends_at.gte.${new Date(from).toISOString()},repeat_weekly_until.gte.${todayKey}`),
    ]);
    const courses = new Map<string, { code: string; color: string }>();
    for (const r of (rows ?? []) as { course: { id: string; code: string; color: string } | { id: string; code: string; color: string }[] | null }[]) {
      const c = Array.isArray(r.course) ? r.course[0] : r.course;
      if (c) courses.set(c.id, { code: c.code, color: c.color });
    }
    const ids = [...courses.keys()];
    const { data: dues } = ids.length
      ? await supabase
          .from('assignments')
          .select('id, course_id, title, due_at')
          .in('course_id', ids)
          .gte('due_at', new Date(from).toISOString())
          .lt('due_at', new Date(to).toISOString())
      : { data: [] as { id: string; course_id: string; title: string; due_at: string }[] };

    const dueIds = ((dues ?? []) as { id: string }[]).map((a) => a.id);
    const [{ data: subs }, { data: quizzes }] = dueIds.length
      ? await Promise.all([
          supabase.from('submissions').select('assignment_id').eq('student_id', userId).in('assignment_id', dueIds),
          supabase.from('quiz_attempts').select('assignment_id').eq('student_id', userId).not('submitted_at', 'is', null).in('assignment_id', dueIds),
        ])
      : [{ data: [] }, { data: [] }];
    const handedIn = new Set([...(subs ?? []), ...(quizzes ?? [])].map((r: { assignment_id: string }) => r.assignment_id));

    const list: Item[] = [];
    for (const o of expandEvents((events ?? []) as CalendarEvent[], from, to)) {
      const c = o.course_id ? courses.get(o.course_id) : undefined;
      list.push({
        key: `${o.id}-${o.start}`,
        day: o.day,
        start: o.start,
        end: o.end,
        title: o.title,
        sub: [c?.code, o.location].filter(Boolean).join(' · '),
        color: o.kind === 'class' && c ? c.color : EVENT_COLORS[o.kind],
        kind: o.kind,
        href: o.course_id ? { pathname: '/course/[id]', params: { id: o.course_id } } : null,
      });
    }
    for (const a of (dues ?? []) as { id: string; course_id: string; title: string; due_at: string }[]) {
      const c = courses.get(a.course_id);
      list.push({
        key: `due-${a.id}`,
        day: watDayKey(a.due_at),
        start: a.due_at,
        end: null,
        title: a.title,
        sub: c?.code ?? '',
        color: colors.ochre,
        kind: 'due',
        done: handedIn.has(a.id),
        href: { pathname: '/assignment/[id]', params: { id: a.id } },
      });
    }
    list.sort((a, b) => a.start.localeCompare(b.start));
    setItems(list);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const days = useMemo(() => {
    const base = new Date(`${today}T12:00:00Z`).getTime();
    return Array.from({ length: SPAN }, (_, i) => new Date(base + i * DAY).toISOString().slice(0, 10));
  }, [today]);

  const byDay = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of items ?? []) m.set(it.day, [...(m.get(it.day) ?? []), it]);
    return m;
  }, [items]);

  if (!items) return <Loading />;

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const shown = selected ? [selected] : days.filter((d) => byDay.has(d));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={s.stripWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip}>
          {days.map((d) => {
            const on = selected === d;
            const count = byDay.get(d)?.length ?? 0;
            return (
              <Pressable key={d} onPress={() => setSelected(on ? null : d)} style={[s.dayPill, on && s.dayPillOn]}>
                <Text style={[s.dayName, on && { color: colors.board }]}>{formatDay(locale, d, { weekday: 'short' }).replace('.', '')}</Text>
                <Text style={[s.dayNum, on && { color: colors.board }]}>{Number(d.slice(8))}</Text>
                <View style={{ flexDirection: 'row', gap: 3, height: 6, marginTop: 2 }}>
                  {Array.from({ length: Math.min(count, 3) }, (_, i) => (
                    <View key={i} style={[s.dot, { backgroundColor: on ? colors.board : d === today ? colors.ochre : 'rgba(248,243,234,0.55)' }]} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <Screen refreshing={refreshing} onRefresh={onRefresh}>
        {shown.length === 0 ? <Empty text={t.noEvents} /> : null}
        {shown.map((d) => {
          const list = byDay.get(d) ?? [];
          return (
            <View key={d} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {d === today ? <Lozenge color={colors.ochre} size={8} /> : null}
                <Text style={s.dayTitle}>
                  {d === today ? `${t.today} · ` : ''}
                  {formatDay(locale, d, { weekday: 'long', day: 'numeric', month: 'long' })}
                </Text>
              </View>
              {list.length === 0 ? (
                <Empty text={t.noEvents} />
              ) : (
                <Card>
                  {list.map((it) => (
                    <Row
                      key={it.key}
                      onPress={it.href ? () => router.push(it.href!) : undefined}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
                    >
                      <View style={{ width: 52 }}>
                        <Text style={s.time}>{formatTime(locale, it.start)}</Text>
                        {it.end ? <Text style={s.timeEnd}>{formatTime(locale, it.end)}</Text> : null}
                      </View>
                      <View style={[s.bar, { backgroundColor: it.color }]} />
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={s.title}>{it.title}</Text>
                        <Text style={s.sub}>{it.sub}</Text>
                      </View>
                      {it.kind === 'due' ? (
                        <View style={[s.kind, { backgroundColor: it.done ? colors.leafSoft : colors.ochreSoft }]}>
                          <Text style={[s.kindText, { color: it.done ? colors.leaf : colors.ochreText }]}>{it.done ? t.submitted : t.statDue}</Text>
                        </View>
                      ) : it.kind !== 'class' ? (
                        <View style={[s.kind, { backgroundColor: '#F1E9DC' }]}>
                          <Text style={[s.kindText, { color: it.color }]}>{t.kinds[it.kind]}</Text>
                        </View>
                      ) : null}
                    </Row>
                  ))}
                </Card>
              )}
            </View>
          );
        })}
      </Screen>
    </View>
  );
}

const s = StyleSheet.create({
  stripWrap: { backgroundColor: colors.board, paddingBottom: 12 },
  strip: { paddingHorizontal: 12, gap: 8 },
  dayPill: {
    width: 54,
    paddingVertical: 8,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(248,243,234,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(248,243,234,0.1)',
  },
  dayPillOn: { backgroundColor: colors.chalk, borderColor: colors.chalk },
  dayName: { color: 'rgba(248,243,234,0.7)', fontSize: 12.5, fontFamily: fonts.medium },
  dayNum: { color: colors.chalk, fontSize: 20, fontFamily: fonts.displayBold },
  dot: { width: 5, height: 5, borderRadius: 3 },
  dayTitle: { fontSize: 18, fontFamily: fonts.display, color: colors.text },
  time: { fontSize: 16, fontFamily: fonts.bold, color: colors.text, fontVariant: ['tabular-nums'] },
  timeEnd: { fontSize: 13.5, color: colors.muted, fontFamily: fonts.body, fontVariant: ['tabular-nums'] },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  title: { fontSize: 16.5, fontFamily: fonts.bold, color: colors.text },
  sub: { fontSize: 14.5, color: colors.muted, fontFamily: fonts.body },
  kind: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  kindText: { fontSize: 12.5, fontFamily: fonts.bold },
});
