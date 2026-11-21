import { Redirect, Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge, Card, Empty, Loading, Row, Screen, SectionTitle, colors } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatDateTime, useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { isPast, type Assignment, type Course } from '@/lib/types';

type CourseCard = Course & { role: 'teacher' | 'ta' | 'student' };

export default function DashboardScreen() {
  const { session, loading, signOut } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const [courses, setCourses] = useState<CourseCard[] | null>(null);
  const [todo, setTodo] = useState<(Assignment & { code: string })[]>([]);
  const [name, setName] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!userId) return;
    const [{ data: profile }, { data: rows }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
      supabase.from('enrollments').select('role, course:courses(id, code, title, description, level, color)').eq('user_id', userId),
    ]);
    setName((profile?.full_name ?? '').split(' ')[0] ?? '');

    const list: CourseCard[] = [];
    for (const row of (rows ?? []) as { role: CourseCard['role']; course: Course | Course[] | null }[]) {
      const c = Array.isArray(row.course) ? row.course[0] : row.course;
      if (c) list.push({ ...c, role: row.role });
    }
    list.sort((a, b) => a.code.localeCompare(b.code));
    setCourses(list);

    const studentIds = list.filter((c) => c.role === 'student').map((c) => c.id);
    if (studentIds.length === 0) {
      setTodo([]);
      return;
    }
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: due } = await supabase
      .from('assignments')
      .select('id, course_id, title, description, due_at, points_possible, weight, component, submission_types')
      .in('course_id', studentIds)
      .gte('due_at', since)
      .order('due_at', { ascending: true })
      .limit(20);
    const dueList = (due ?? []) as Assignment[];
    const { data: mine } = dueList.length
      ? await supabase
          .from('submissions')
          .select('assignment_id')
          .eq('student_id', userId)
          .in('assignment_id', dueList.map((a) => a.id))
      : { data: [] as { assignment_id: string }[] };
    const { data: quizDone } = dueList.length
      ? await supabase
          .from('quiz_attempts')
          .select('assignment_id')
          .eq('student_id', userId)
          .not('submitted_at', 'is', null)
          .in('assignment_id', dueList.map((a) => a.id))
      : { data: [] as { assignment_id: string }[] };
    const done = new Set([...(mine ?? []), ...(quizDone ?? [])].map((m) => m.assignment_id));
    setTodo(
      dueList
        .filter((a) => !done.has(a.id))
        .map((a) => ({ ...a, code: list.find((c) => c.id === a.course_id)?.code ?? '' })),
    );
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) return <Loading />;
  if (!session) return <Redirect href="/login" />;

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Ardoise',
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <Pressable onPress={() => setLocale(locale === 'fr' ? 'en' : 'fr')} hitSlop={10}>
                <Text style={s.headerAction}>{locale === 'fr' ? 'EN' : 'FR'}</Text>
              </Pressable>
              <Pressable onPress={signOut} hitSlop={10}>
                <Text style={s.headerAction}>{t.signOut}</Text>
              </Pressable>
            </View>
          ),
        }}
      />
      <Screen refreshing={refreshing} onRefresh={onRefresh}>
        <Text style={s.greeting}>
          {t.hello}
          {name ? `, ${name}` : ''}
        </Text>

        <SectionTitle>{t.todo}</SectionTitle>
        {todo.length === 0 ? (
          <Card style={{ padding: 16 }}>
            <Text style={{ color: colors.muted }}>{t.nothingDue}</Text>
          </Card>
        ) : (
          <Card>
            {todo.map((a) => (
              <Row key={a.id} onPress={() => router.push({ pathname: '/assignment/[id]', params: { id: a.id } })}>
                <Text style={s.itemTitle}>{a.title}</Text>
                <Text style={{ color: isPast(a.due_at) ? colors.danger : colors.muted, fontSize: 13 }}>
                  {a.code} · {formatDateTime(locale, a.due_at)}
                </Text>
              </Row>
            ))}
          </Card>
        )}

        <Pressable onPress={() => router.push('/results')} style={({ pressed }) => [s.resultsLink, pressed && { opacity: 0.85 }]}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{t.myResults}</Text>
          <Text style={{ color: '#CBD5E1', fontSize: 18 }}>→</Text>
        </Pressable>

        <SectionTitle>{t.myCourses}</SectionTitle>
        {courses === null ? (
          <Loading />
        ) : courses.length === 0 ? (
          <Empty text={t.noCourses} />
        ) : (
          courses.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => router.push({ pathname: '/course/[id]', params: { id: c.id } })}
              style={({ pressed }) => [s.courseCard, pressed && { opacity: 0.9 }]}
            >
              <View style={[s.courseBand, { backgroundColor: c.color }]}>
                <Text style={s.courseCode}>{c.code}</Text>
              </View>
              <View style={{ padding: 14, gap: 8 }}>
                <Text style={s.itemTitle}>{c.title}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Badge label={c.role === 'student' ? t.student : t.teaching} tone={c.role === 'student' ? 'info' : 'brand'} />
                  {c.level ? <Badge label={c.level} /> : null}
                </View>
              </View>
            </Pressable>
          ))
        )}
      </Screen>
    </>
  );
}

const s = StyleSheet.create({
  headerAction: { color: '#E2E8F0', fontWeight: '600', fontSize: 14 },
  greeting: { fontSize: 24, fontWeight: '700', color: colors.text },
  resultsLink: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.board,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  itemTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  courseCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  courseBand: { height: 64, padding: 12, justifyContent: 'flex-start' },
  courseCode: {
    alignSelf: 'flex-start',
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
});
