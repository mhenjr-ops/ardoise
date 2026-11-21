import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Icon, NdopPattern } from '@/components/ndop';
import { Text } from '@/components/text';
import { Avatar, Badge, Button, Card, Empty, Loading, Lozenge, Row, Screen, SectionTitle, Slate, colors, fonts } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { daysUntil, expandEvents, type CalendarEvent, type Occurrence } from '@/lib/engage';
import { fmt, formatDay, formatScore, formatTime, timeAgo, useI18n, watDayKey } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { weightedAverage, type Assignment, type Course, type Grade } from '@/lib/types';

type Role = 'teacher' | 'ta' | 'student';
type CourseCard = Course & { role: Role };
type Due = Assignment & { code: string; color: string };
type Pending = { assignment_id: string; title: string; code: string; student: string; submitted_at: string };
type Stats = { average: number | null; attendance: number | null; due: number; courses: number; toGrade: number };
type Home = {
  name: string;
  email: string;
  courses: CourseCard[];
  todo: Due[];
  today: (Occurrence & { code: string; color: string })[];
  pending: Pending[];
  stats: Stats;
  student: boolean;
  staff: boolean;
};

const TITLES = new Set(['dr', 'dr.', 'pr', 'pr.', 'prof', 'prof.', 'm.', 'mme', 'mlle', 'mr', 'mrs', 'ms']);

/** "Brenda Fon" → "Brenda"; "Dr Jean-Paul Mbarga" → "Dr Mbarga". */
function greetingName(full: string) {
  const words = full.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (TITLES.has(words[0].toLowerCase()) && words.length > 1) return `${words[0]} ${words[words.length - 1]}`;
  return words[0];
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default function HomeScreen() {
  const { session, signOut } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const [data, setData] = useState<Home | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!userId) return;
    const stamp = Date.now();
    setNow(stamp);
    const [{ data: profile }, { data: rows }] = await Promise.all([
      supabase.from('profiles').select('full_name, email').eq('id', userId).maybeSingle(),
      supabase.from('enrollments').select('role, course:courses(id, code, title, description, level, color)').eq('user_id', userId),
    ]);
    const courses: CourseCard[] = [];
    for (const row of (rows ?? []) as { role: Role; course: Course | Course[] | null }[]) {
      const c = one(row.course);
      if (c) courses.push({ ...c, role: row.role });
    }
    courses.sort((a, b) => a.code.localeCompare(b.code));
    const byId = new Map(courses.map((c) => [c.id, c]));
    const studentIds = courses.filter((c) => c.role === 'student').map((c) => c.id);
    const staffIds = courses.filter((c) => c.role !== 'student').map((c) => c.id);

    const dayStart = new Date(`${watDayKey(stamp)}T00:00:00+01:00`).getTime();
    const dayEnd = dayStart + 86400000;

    const [asg, grades, subs, quizDone, attendance, events, staffSubs, staffGrades] = await Promise.all([
      studentIds.length
        ? supabase
            .from('assignments')
            .select('id, course_id, title, description, due_at, points_possible, weight, component, submission_types')
            .in('course_id', studentIds)
        : Promise.resolve({ data: [] }),
      studentIds.length
        ? supabase.from('grades').select('assignment_id, student_id, score, comment').eq('student_id', userId).in('course_id', studentIds)
        : Promise.resolve({ data: [] }),
      studentIds.length
        ? supabase.from('submissions').select('assignment_id').eq('student_id', userId).in('course_id', studentIds)
        : Promise.resolve({ data: [] }),
      studentIds.length
        ? supabase.from('quiz_attempts').select('assignment_id').eq('student_id', userId).not('submitted_at', 'is', null)
        : Promise.resolve({ data: [] }),
      studentIds.length
        ? supabase.from('attendance_records').select('status').eq('student_id', userId)
        : Promise.resolve({ data: [] }),
      supabase
        .from('calendar_events')
        .select('id, course_id, title, location, kind, starts_at, ends_at, repeat_weekly_until')
        .lt('starts_at', new Date(dayEnd).toISOString()),
      staffIds.length
        ? supabase
            .from('submissions')
            .select('assignment_id, student_id, course_id, submitted_at, assignment:assignments(title), student:profiles(full_name, email)')
            .in('course_id', staffIds)
            .order('submitted_at', { ascending: true })
        : Promise.resolve({ data: [] }),
      staffIds.length
        ? supabase.from('grades').select('assignment_id, student_id, score').in('course_id', staffIds).not('score', 'is', null)
        : Promise.resolve({ data: [] }),
    ]);

    const assignments = (asg.data ?? []) as Assignment[];
    const myGrades = (grades.data ?? []) as Grade[];
    const done = new Set([...(subs.data ?? []), ...(quizDone.data ?? [])].map((r: { assignment_id: string }) => r.assignment_id));
    const todo: Due[] = assignments
      .filter((a) => a.due_at && !done.has(a.id) && new Date(a.due_at).getTime() > stamp - 7 * 86400000)
      .sort((a, b) => (a.due_at ?? '').localeCompare(b.due_at ?? ''))
      .slice(0, 8)
      .map((a) => ({ ...a, code: byId.get(a.course_id)?.code ?? '', color: byId.get(a.course_id)?.color ?? colors.board }));

    const averages = studentIds
      .map((cid) => weightedAverage(assignments.filter((a) => a.course_id === cid), myGrades, userId))
      .filter((v): v is number => v !== null);
    const average = averages.length ? Math.round((averages.reduce((s, v) => s + v, 0) / averages.length) * 100) / 100 : null;

    const records = (attendance.data ?? []) as { status: string }[];
    const attended = records.filter((r) => r.status === 'present' || r.status === 'late' || r.status === 'excused').length;

    const graded = new Set(((staffGrades.data ?? []) as { assignment_id: string; student_id: string }[]).map((g) => `${g.assignment_id}:${g.student_id}`));
    type SubRow = {
      assignment_id: string;
      student_id: string;
      course_id: string;
      submitted_at: string;
      assignment: { title: string } | { title: string }[] | null;
      student: { full_name: string; email: string } | { full_name: string; email: string }[] | null;
    };
    const pending: Pending[] = ((staffSubs.data ?? []) as SubRow[])
      .filter((s) => !graded.has(`${s.assignment_id}:${s.student_id}`))
      .map((s) => {
        const st = one(s.student);
        return {
          assignment_id: s.assignment_id,
          title: one(s.assignment)?.title ?? '',
          code: byId.get(s.course_id)?.code ?? '',
          student: st ? st.full_name || st.email : '',
          submitted_at: s.submitted_at,
        };
      });
    const toGrade = pending.length;

    const today = expandEvents((events.data ?? []) as CalendarEvent[], dayStart, dayEnd)
      .filter((o) => o.day === watDayKey(stamp))
      .map((o) => {
        const c = o.course_id ? byId.get(o.course_id) : undefined;
        return { ...o, code: c?.code ?? '', color: c?.color ?? colors.info };
      });

    setData({
      name: greetingName((profile?.full_name as string | undefined) ?? ''),
      email: (profile?.email as string | undefined) ?? session?.user.email ?? '',
      courses,
      todo,
      today,
      pending: pending.slice(0, 6),
      student: studentIds.length > 0,
      staff: staffIds.length > 0,
      stats: {
        average,
        attendance: records.length ? Math.round((attended / records.length) * 100) : null,
        due: todo.filter((a) => daysUntil(a.due_at!, stamp) >= 0).length,
        courses: courses.length,
        toGrade,
      },
    });
  }, [userId, session?.user.email]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!data) return <Loading />;

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Douala' }).format(new Date(now)));
  const greeting = hour >= 18 ? t.goodEvening : t.goodMorning;

  function dueChip(iso: string) {
    const d = daysUntil(iso, now);
    if (new Date(iso).getTime() < now) return { label: t.overdue, bg: colors.dangerSoft, fg: colors.danger };
    if (d === 0) return { label: t.dueToday, bg: colors.ochreSoft, fg: colors.ochreText };
    if (d === 1) return { label: t.dueTomorrow, bg: colors.ochreSoft, fg: colors.ochreText };
    return { label: fmt(t.dueInDays, { n: d }), bg: '#F1E9DC', fg: '#453D33' };
  }

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Slate style={{ gap: 18 }}>
        <View style={{ gap: 2 }}>
          <Text style={s.date}>{formatDay(locale, watDayKey(now), { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
          <Text style={s.hello}>
            {greeting}
            {data.name ? `, ${data.name}` : ''}
          </Text>
        </View>
        <View style={s.stats}>
          {data.student ? (
            <>
              <Stat
                label={t.statAverage}
                value={data.stats.average === null ? '—' : formatScore(locale, data.stats.average)}
                suffix={data.stats.average === null ? '' : '/20'}
                meter={data.stats.average === null ? undefined : data.stats.average / 20}
              />
              <Stat
                label={t.statAttendance}
                value={data.stats.attendance === null ? '—' : String(data.stats.attendance)}
                suffix={data.stats.attendance === null ? '' : '%'}
                meter={data.stats.attendance === null ? undefined : data.stats.attendance / 100}
                meterColor="#8CC497"
              />
              <Stat label={t.statDue} value={String(data.stats.due)} />
            </>
          ) : (
            <>
              <Stat label={t.statCourses} value={String(data.stats.courses)} />
              <Stat label={t.statToGrade} value={String(data.stats.toGrade)} />
            </>
          )}
        </View>
      </Slate>

      {data.student ? <CheckInCard onDone={load} /> : null}

      {data.today.length ? (
        <>
          <SectionTitle>{t.today}</SectionTitle>
          <Card>
            {data.today.map((o) => (
              <Row
                key={`${o.id}-${o.start}`}
                onPress={o.course_id ? () => router.push({ pathname: '/course/[id]', params: { id: o.course_id! } }) : undefined}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
              >
                <View style={{ width: 52 }}>
                  <Text style={s.time}>{formatTime(locale, o.start)}</Text>
                  <Text style={s.timeEnd}>{formatTime(locale, o.end)}</Text>
                </View>
                <View style={[s.bar, { backgroundColor: o.color }]} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.itemTitle}>{o.title}</Text>
                  <Text style={s.meta}>{[o.code, o.location].filter(Boolean).join(' · ')}</Text>
                </View>
              </Row>
            ))}
          </Card>
        </>
      ) : null}

      {data.student ? (
        <>
          <SectionTitle>{t.todo}</SectionTitle>
          {data.todo.length === 0 ? (
            <Empty text={t.nothingDue} />
          ) : (
            <Card>
              {data.todo.map((a) => {
                const chip = dueChip(a.due_at!);
                return (
                  <Row
                    key={a.id}
                    onPress={() => router.push({ pathname: '/assignment/[id]', params: { id: a.id } })}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
                  >
                    <Lozenge color={a.color} size={9} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={s.itemTitle}>{a.title}</Text>
                      <Text style={s.meta}>
                        {a.code} · {formatDay(locale, watDayKey(a.due_at!), { weekday: 'short', day: 'numeric', month: 'short' })},{' '}
                        {formatTime(locale, a.due_at!)}
                      </Text>
                    </View>
                    <View style={[s.chip, { backgroundColor: chip.bg }]}>
                      <Text style={[s.chipText, { color: chip.fg }]}>{chip.label}</Text>
                    </View>
                  </Row>
                );
              })}
            </Card>
          )}
        </>
      ) : null}

      {data.staff ? (
        <>
          <SectionTitle>{t.toGradeList}</SectionTitle>
          {data.pending.length === 0 ? (
            <Empty text={t.nothingToGrade} />
          ) : (
            <Card>
              {data.pending.map((p) => (
                <Row
                  key={`${p.assignment_id}-${p.student}`}
                  onPress={() => router.push({ pathname: '/grade/[id]', params: { id: p.assignment_id } })}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
                >
                  <Avatar name={p.student} size={36} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.itemTitle}>{p.student}</Text>
                    <Text style={s.meta} numberOfLines={1}>
                      {p.code} · {p.title}
                    </Text>
                  </View>
                  <Text style={s.meta}>{timeAgo(locale, p.submitted_at, now)}</Text>
                </Row>
              ))}
            </Card>
          )}
        </>
      ) : null}

      <SectionTitle>{t.myCourses}</SectionTitle>
      {data.courses.length === 0 ? (
        <Empty text={t.noCourses} />
      ) : (
        <View style={{ gap: 12 }}>
          {data.courses.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => router.push({ pathname: '/course/[id]', params: { id: c.id } })}
              style={({ pressed }) => [s.courseCard, pressed && { transform: [{ scale: 0.99 }] }]}
            >
              <View style={[s.cover, { backgroundColor: c.color }]}>
                <NdopPattern opacity={0.2} size={72} />
                <View style={s.codePill}>
                  <Text style={s.codeText}>{c.code}</Text>
                </View>
              </View>
              <View style={{ padding: 14, gap: 8 }}>
                <Text style={s.courseTitle}>{c.title}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Badge label={c.role === 'student' ? t.student : t.teaching} tone={c.role === 'student' ? 'info' : 'brand'} />
                  {c.level ? <Badge label={c.level} /> : null}
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      <SectionTitle>{t.account}</SectionTitle>
      <Card style={{ padding: 16, gap: 14 }}>
        <View style={{ gap: 2 }}>
          <Text style={s.itemTitle}>{data.email}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={s.meta}>{t.language}</Text>
          <View style={s.segment}>
            {(['fr', 'en'] as const).map((l) => (
              <Pressable key={l} onPress={() => setLocale(l)} style={[s.segmentItem, locale === l && s.segmentOn]}>
                <Text style={[s.segmentText, locale === l && { color: colors.chalk }]}>{l === 'fr' ? 'Français' : 'English'}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Button title={t.signOut} variant="secondary" onPress={signOut} />
      </Card>
    </Screen>
  );
}

function Stat({ label, value, suffix, meter, meterColor = colors.ochre }: { label: string; value: string; suffix?: string; meter?: number; meterColor?: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {suffix ? <Text style={s.statSuffix}>{suffix}</Text> : null}
      </Text>
      {meter !== undefined ? (
        <View style={s.meterTrack}>
          <View style={[s.meterFill, { width: `${Math.round(Math.max(0, Math.min(1, meter)) * 100)}%`, backgroundColor: meterColor }]} />
        </View>
      ) : null}
    </View>
  );
}

function CheckInCard({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    if (code.length !== 6) return;
    setBusy(true);
    setResult(null);
    const { data, error } = await supabase.rpc('check_in', { p_code: code });
    setBusy(false);
    const res = data as { status: string; attendance?: keyof typeof t.statuses; course?: string } | null;
    if (error || !res) setResult({ ok: false, text: t.error });
    else if (res.status === 'ok') {
      setResult({ ok: true, text: fmt(t.checkedIn, { status: t.statuses[res.attendance ?? 'present'], course: res.course }) });
      setCode('');
      onDone();
    } else setResult({ ok: false, text: res.status === 'too_many_attempts' ? t.tooMany : t.invalidCode });
  }

  return (
    <Card style={{ padding: 16, gap: 12, borderColor: '#EBCB8F', backgroundColor: colors.ochreSoft }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={s.checkIcon}>
          <Icon name="check" color="#12100C" size={18} strokeWidth={2.4} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.itemTitle}>{t.checkInTitle}</Text>
          <Text style={s.meta}>{t.checkInHelp}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TextInput
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="000000"
          placeholderTextColor="#C9B48F"
          style={s.codeInput}
          onSubmitEditing={submit}
          accessibilityLabel={t.checkInHelp}
        />
        <View style={{ flex: 1 }}>
          <Button title={t.checkIn} variant="accent" onPress={submit} loading={busy} disabled={code.length !== 6} />
        </View>
      </View>
      {result ? (
        <Text style={{ fontFamily: fonts.bold, color: result.ok ? colors.leaf : colors.danger, fontSize: 15 }}>{result.text}</Text>
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  date: { color: 'rgba(248,243,234,0.7)', fontSize: 15, fontFamily: fonts.medium },
  hello: { color: colors.chalk, fontSize: 30, fontFamily: fonts.display, lineHeight: 36 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: 'rgba(248,243,234,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(248,243,234,0.12)',
    paddingHorizontal: 11,
    paddingVertical: 10,
    gap: 2,
  },
  statLabel: { color: 'rgba(248,243,234,0.72)', fontSize: 13.5, fontFamily: fonts.medium },
  statValue: { color: colors.chalk, fontSize: 24, fontFamily: fonts.displayBold },
  statSuffix: { color: 'rgba(248,243,234,0.6)', fontSize: 13, fontFamily: fonts.medium },
  meterTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(248,243,234,0.16)', marginTop: 6, overflow: 'hidden' },
  meterFill: { height: 4, borderRadius: 2 },
  time: { fontSize: 16, fontFamily: fonts.bold, color: colors.text, fontVariant: ['tabular-nums'] },
  timeEnd: { fontSize: 13.5, color: colors.muted, fontFamily: fonts.body, fontVariant: ['tabular-nums'] },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  itemTitle: { fontSize: 16.5, fontFamily: fonts.bold, color: colors.text },
  meta: { fontSize: 14.5, color: colors.muted, fontFamily: fonts.body },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 13, fontFamily: fonts.bold },
  courseCard: { backgroundColor: colors.card, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  cover: { height: 92, padding: 12, overflow: 'hidden' },
  codePill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(18,16,12,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  codeText: { color: colors.chalk, fontFamily: fonts.heavy, fontSize: 13, letterSpacing: 0.4 },
  courseTitle: { fontSize: 19, fontFamily: fonts.display, color: colors.text },
  segment: { flexDirection: 'row', backgroundColor: '#F1E9DC', borderRadius: 10, padding: 3 },
  segmentItem: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  segmentOn: { backgroundColor: colors.board },
  segmentText: { fontFamily: fonts.bold, fontSize: 14, color: '#453D33' },
  checkIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.ochre, alignItems: 'center', justifyContent: 'center' },
  codeInput: {
    width: 150,
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0C186',
    backgroundColor: colors.card,
    textAlign: 'center',
    fontSize: 24,
    letterSpacing: 6,
    fontFamily: fonts.heavy,
    color: colors.text,
  },
});
