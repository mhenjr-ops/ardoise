import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/text';
import { Avatar, Button, Card, Empty, Input, Loading, Screen, colors, fonts } from '@/components/ui';
import { fmt, formatScore, timeAgo, useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

type Level = { id: string; title: string; points: number };
type Criterion = { id: string; title: string; description?: string; levels: Level[] };
type Student = { id: string; name: string };
type Sub = { student_id: string; body: string | null; file_path: string | null; file_name: string | null; submitted_at: string };
type GradeRow = { student_id: string; score: number | null; comment: string | null };
type Ratings = Record<string, { level: string; comment?: string }>;
type Data = {
  title: string;
  points: number;
  students: Student[];
  subs: Map<string, Sub>;
  grades: Map<string, GradeRow>;
  criteria: Criterion[] | null;
  assessments: Map<string, Ratings>;
};

const IMAGE = /\.(jpe?g|png|webp|heic)$/i;

/** Grade on the phone: one student at a time, typed mark or the assignment's rubric. */
export default function GradeScreen() {
  const { id, student } = useLocalSearchParams<{ id: string; student?: string }>();
  const { t, locale } = useI18n();
  const [data, setData] = useState<Data | null>(null);
  const [current, setCurrent] = useState<string | null>(student ?? null);
  const [score, setScore] = useState('');
  const [comment, setComment] = useState('');
  const [ratings, setRatings] = useState<Ratings>({});
  const [signed, setSigned] = useState<{ path: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!id) return;
    setNow(Date.now());
    const { data: a } = await supabase.from('assignments').select('id, course_id, title, points_possible, rubric_id').eq('id', id).maybeSingle();
    if (!a) return;
    const [{ data: roster }, { data: subs }, { data: grades }, rubric, { data: assess }] = await Promise.all([
      supabase.from('enrollments').select('user:profiles(id, full_name, email)').eq('course_id', a.course_id).eq('role', 'student'),
      supabase.from('submissions').select('student_id, body, file_path, file_name, submitted_at').eq('assignment_id', id),
      supabase.from('grades').select('student_id, score, comment').eq('assignment_id', id),
      a.rubric_id ? supabase.from('rubrics').select('criteria').eq('id', a.rubric_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('rubric_assessments').select('student_id, ratings').eq('assignment_id', id),
    ]);
    const subMap = new Map(((subs ?? []) as Sub[]).map((s) => [s.student_id, s]));
    const students = ((roster ?? []) as { user: { id: string; full_name: string; email: string } | { id: string; full_name: string; email: string }[] | null }[])
      .map((r) => (Array.isArray(r.user) ? r.user[0] : r.user))
      .filter((u): u is { id: string; full_name: string; email: string } => !!u)
      .map((u) => ({ id: u.id, name: u.full_name || u.email }))
      // Handed-in work first (oldest first, like a pile of copies), then everyone else by name.
      .sort((x, y) => {
        const sx = subMap.get(x.id);
        const sy = subMap.get(y.id);
        if (sx && sy) return sx.submitted_at.localeCompare(sy.submitted_at);
        if (sx || sy) return sx ? -1 : 1;
        return x.name.localeCompare(y.name);
      });
    const criteria = ((rubric.data as { criteria: Criterion[] } | null)?.criteria ?? null) as Criterion[] | null;
    setData({
      title: a.title as string,
      points: Number(a.points_possible),
      students,
      subs: subMap,
      grades: new Map(((grades ?? []) as GradeRow[]).map((g) => [g.student_id, g])),
      criteria: criteria && criteria.length ? criteria : null,
      assessments: new Map(((assess ?? []) as { student_id: string; ratings: Ratings }[]).map((r) => [r.student_id, r.ratings])),
    });
    setCurrent((c) => c ?? students.find((s) => subMap.has(s.id))?.id ?? students[0]?.id ?? null);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Fill the form whenever the selected student (or the loaded data) changes.
  const selected = useMemo(() => {
    if (!data || !current) return null;
    return {
      student: data.students.find((s) => s.id === current) ?? null,
      sub: data.subs.get(current) ?? null,
      grade: data.grades.get(current) ?? null,
      ratings: data.assessments.get(current) ?? {},
    };
  }, [data, current]);

  const [formFor, setFormFor] = useState<string | null>(null);
  if (selected && formFor !== current) {
    setFormFor(current);
    setScore(selected.grade?.score === null || selected.grade?.score === undefined ? '' : String(selected.grade.score).replace('.', locale === 'fr' ? ',' : '.'));
    setComment(selected.grade?.comment ?? '');
    setRatings(selected.ratings);
    setFlash(null);
  }

  const filePath = selected?.sub?.file_path ?? null;
  useEffect(() => {
    if (!filePath) return;
    let alive = true;
    supabase.storage
      .from('submissions')
      .createSignedUrl(filePath, 60 * 30)
      .then(({ data: res }) => {
        if (alive && res?.signedUrl) setSigned({ path: filePath, url: res.signedUrl });
      });
    return () => {
      alive = false;
    };
  }, [filePath]);
  const fileUrl = signed && signed.path === filePath ? signed.url : null;

  if (!data) return <Loading />;

  const graded = data.students.filter((s) => {
    const g = data.grades.get(s.id);
    return g && g.score !== null;
  }).length;
  const idx = data.students.findIndex((s) => s.id === current);
  const next = data.students.slice(idx + 1).find((s) => data.subs.has(s.id) && !(data.grades.get(s.id)?.score !== undefined && data.grades.get(s.id)?.score !== null))
    ?? data.students[idx + 1];

  const rubricMax = data.criteria?.reduce((sum, c) => sum + Math.max(...c.levels.map((l) => l.points)), 0) ?? 0;
  const rubricEarned = data.criteria?.reduce((sum, c) => sum + (c.levels.find((l) => l.id === ratings[c.id]?.level)?.points ?? 0), 0) ?? 0;
  const rubricComplete = !!data.criteria && data.criteria.every((c) => ratings[c.id]?.level);

  async function save(goNext: boolean) {
    if (!data || !current) return;
    setBusy(true);
    setFlash(null);
    let error: unknown = null;
    if (data.criteria) {
      const res = await supabase.rpc('save_rubric_assessment', {
        p_assignment: id,
        p_student: current,
        p_ratings: ratings,
        p_comment: comment.trim() || null,
      });
      error = res.error;
    } else {
      const raw = score.trim().replace(',', '.');
      const value = raw === '' ? null : Number(raw);
      if (value !== null && (Number.isNaN(value) || value < 0 || value > data.points)) {
        setBusy(false);
        setFlash({ ok: false, text: fmt(t.invalidScore, { points: formatScore(locale, data.points) }) });
        return;
      }
      const res = await supabase
        .from('grades')
        .upsert({ assignment_id: id, student_id: current, score: value, comment: comment.trim() || null }, { onConflict: 'assignment_id,student_id' });
      error = res.error;
    }
    setBusy(false);
    if (error) {
      setFlash({ ok: false, text: t.error });
      return;
    }
    await load();
    if (goNext && next) {
      setCurrent(next.id);
    } else {
      setFormFor(null);
      setFlash({ ok: true, text: t.gradeSaved });
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t.gradeTitle }} />
      <View style={{ gap: 4 }}>
        <Text style={s.title}>{data.title}</Text>
        <Text style={s.meta}>{fmt(t.gradedCount, { n: graded, total: data.students.length })}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {data.students.map((st) => {
          const on = st.id === current;
          const g = data.grades.get(st.id);
          const done = g && g.score !== null;
          const handed = data.subs.has(st.id);
          return (
            <Pressable key={st.id} onPress={() => setCurrent(st.id)} style={[s.chip, on && s.chipOn]}>
              <View style={[s.dot, { backgroundColor: done ? colors.leaf : handed ? colors.ochre : '#C9B99F' }]} />
              <Text style={[s.chipText, on && { color: colors.chalk }]}>{st.name.split(' ')[0]}</Text>
              {done ? <Text style={[s.chipScore, on && { color: colors.chalkYellow }]}>{formatScore(locale, g!.score)}</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {selected?.student ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar name={selected.student.name} size={38} />
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{selected.student.name}</Text>
              <Text style={s.meta}>
                {selected.sub ? fmt(t.handedInWhen, { when: timeAgo(locale, selected.sub.submitted_at, now) }) : t.notSubmitted}
              </Text>
            </View>
          </View>

          {selected.sub ? (
            <Card style={{ padding: 14, gap: 10 }}>
              {selected.sub.body ? <Text style={s.work}>{selected.sub.body}</Text> : null}
              {selected.sub.file_path && fileUrl ? (
                IMAGE.test(selected.sub.file_name ?? '') ? (
                  <Image source={{ uri: fileUrl }} style={s.photo} resizeMode="contain" />
                ) : (
                  <Button title={`${t.openFile} · ${selected.sub.file_name ?? ''}`} variant="secondary" onPress={() => Linking.openURL(fileUrl)} />
                )
              ) : null}
            </Card>
          ) : (
            <Empty text={t.noWorkYet} />
          )}

          {data.criteria ? (
            <View style={{ gap: 10 }}>
              {data.criteria.map((c) => (
                <Card key={c.id} style={{ padding: 14, gap: 8 }}>
                  <Text style={s.crit}>{c.title}</Text>
                  {c.description ? <Text style={s.meta}>{c.description}</Text> : null}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {c.levels.map((l) => {
                      const on = ratings[c.id]?.level === l.id;
                      return (
                        <Pressable
                          key={l.id}
                          onPress={() => setRatings({ ...ratings, [c.id]: { ...ratings[c.id], level: l.id } })}
                          style={[s.level, on && s.levelOn]}
                        >
                          <Text style={[s.levelText, on && { color: colors.chalk }]}>{l.title}</Text>
                          <Text style={[s.levelPts, on && { color: colors.chalkYellow }]}>{formatScore(locale, l.points)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </Card>
              ))}
              <Text style={s.total}>
                {fmt(t.rubricScore, {
                  score: formatScore(locale, rubricMax ? Math.round((rubricEarned / rubricMax) * data.points * 100) / 100 : 0),
                  points: formatScore(locale, data.points),
                })}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 6 }}>
              <Text style={s.label}>{fmt(t.scoreOn, { points: formatScore(locale, data.points) })}</Text>
              <TextInput value={score} onChangeText={setScore} keyboardType="decimal-pad" style={s.score} placeholder="—" placeholderTextColor="#A8977D" />
            </View>
          )}

          <Input label={t.comment} value={comment} onChangeText={setComment} multiline />
          {flash ? <Text style={{ fontFamily: fonts.bold, color: flash.ok ? colors.leaf : colors.danger }}>{flash.text}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button title={t.save} variant="secondary" onPress={() => save(false)} loading={busy} disabled={!!data.criteria && !rubricComplete} />
            </View>
            {next ? (
              <View style={{ flex: 1.3 }}>
                <Button title={t.saveNext} onPress={() => save(true)} loading={busy} disabled={!!data.criteria && !rubricComplete} />
              </View>
            ) : null}
          </View>
        </>
      ) : (
        <Empty text={t.noWorkYet} />
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 22, fontFamily: fonts.display, color: colors.text, lineHeight: 28 },
  meta: { fontSize: 14.5, color: colors.muted, fontFamily: fonts.body },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.board, borderColor: colors.board },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  chipScore: { fontFamily: fonts.bold, fontSize: 13, color: colors.leaf },
  name: { fontFamily: fonts.bold, fontSize: 17, color: colors.text },
  work: { fontFamily: 'monospace', fontSize: 14, lineHeight: 21, color: colors.text, backgroundColor: '#F7F1E6', padding: 12, borderRadius: 10 },
  photo: { width: '100%', height: 360, borderRadius: 10, backgroundColor: '#F1E9DC' },
  crit: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  level: { borderRadius: 12, borderWidth: 1, borderColor: '#D2C3AB', backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 8, minWidth: 92 },
  levelOn: { backgroundColor: colors.board, borderColor: colors.board },
  levelText: { fontFamily: fonts.bold, fontSize: 14.5, color: colors.text },
  levelPts: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted },
  total: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  label: { fontSize: 15, fontFamily: fonts.bold, color: '#453D33' },
  score: {
    height: 64,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D2C3AB',
    backgroundColor: colors.card,
    fontSize: 30,
    fontFamily: fonts.displayBold,
    color: colors.text,
    textAlign: 'center',
  },
});
