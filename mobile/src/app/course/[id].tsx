import { Redirect, Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CourseAttendance } from '@/components/course/attendance';
import { CourseDiscussions } from '@/components/course/discussions';
import { NdopPattern } from '@/components/ndop';
import { Text } from '@/components/text';
import { Badge, Button, Card, Empty, Input, Loading, Lozenge, Muted, Row, Screen, colors, fonts } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatScore, useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import {
  isPast,
  weightedAverage,
  type Announcement,
  type Assignment,
  type Course,
  type Grade,
  type ModuleItem,
  type ModuleRow,
} from '@/lib/types';

type Tab = 'modules' | 'announcements' | 'assignments' | 'discussions' | 'attendance' | 'grades';

type Data = {
  course: Course;
  isStaff: boolean;
  role: string | null;
  modules: ModuleRow[];
  items: ModuleItem[];
  announcements: Announcement[];
  assignments: Assignment[];
  grades: Grade[];
  submitted: Set<string>;
};

export default function CourseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, loading } = useAuth();
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<Tab>('modules');
  const [data, setData] = useState<Data | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [posting, setPosting] = useState(false);
  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!userId || !id) return;
    const { data: course } = await supabase
      .from('courses')
      .select('id, code, title, description, level, color')
      .eq('id', id)
      .maybeSingle();
    if (!course) {
      setNotFound(true);
      return;
    }
    const [staff, role, mods, items, anns, asgs, grades, subs] = await Promise.all([
      supabase.rpc('is_course_staff', { course: id }),
      supabase.rpc('course_role', { course: id }),
      supabase.from('modules').select('id, title, position').eq('course_id', id).order('position'),
      supabase
        .from('module_items')
        .select('id, module_id, item_type, title, page_id, assignment_id, url, position')
        .eq('course_id', id)
        .order('position'),
      supabase.from('announcements').select('id, title, body, created_at').eq('course_id', id).order('created_at', { ascending: false }),
      supabase
        .from('assignments')
        .select('id, course_id, title, description, due_at, points_possible, weight, component, submission_types')
        .eq('course_id', id)
        .order('due_at', { ascending: true, nullsFirst: false }),
      supabase.from('grades').select('assignment_id, student_id, score, comment').eq('course_id', id).eq('student_id', userId),
      supabase.from('submissions').select('assignment_id').eq('course_id', id).eq('student_id', userId),
    ]);
    setData({
      course: course as Course,
      isStaff: staff.data === true,
      role: (role.data as string | null) ?? null,
      modules: (mods.data ?? []) as ModuleRow[],
      items: (items.data ?? []) as ModuleItem[],
      announcements: (anns.data ?? []) as Announcement[],
      assignments: (asgs.data ?? []) as Assignment[],
      grades: (grades.data ?? []) as Grade[],
      submitted: new Set(((subs.data ?? []) as { assignment_id: string }[]).map((r) => r.assignment_id)),
    });
  }, [id, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) return <Loading />;
  if (!session) return <Redirect href="/login" />;
  if (notFound) return <Screen><Empty text="404" /></Screen>;
  if (!data) return <Loading />;

  const { course } = data;

  function openItem(item: ModuleItem) {
    if (item.item_type === 'page' && item.page_id) router.push({ pathname: '/page/[id]', params: { id: item.page_id } });
    else if (item.item_type === 'assignment' && item.assignment_id)
      router.push({ pathname: '/assignment/[id]', params: { id: item.assignment_id } });
    else if (item.item_type === 'link' && item.url) Linking.openURL(item.url);
  }

  async function postAnnouncement() {
    if (!annTitle.trim()) return;
    setPosting(true);
    const { error } = await supabase
      .from('announcements')
      .insert({ course_id: course.id, title: annTitle.trim(), body: annBody.trim(), author_id: userId });
    setPosting(false);
    if (!error) {
      setAnnTitle('');
      setAnnBody('');
      load();
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'modules', label: t.modules },
    { key: 'announcements', label: t.announcements },
    { key: 'assignments', label: t.assignments },
    { key: 'discussions', label: t.discussions },
    { key: 'attendance', label: t.attendanceTab },
    ...(data.isStaff ? [] : [{ key: 'grades' as Tab, label: t.grades }]),
  ];

  const average = weightedAverage(data.assignments, data.grades, userId ?? '');

  return (
    <>
      <Stack.Screen options={{ title: course.code }} />
      <Screen
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          await load();
          setRefreshing(false);
        }}
      >
        <View style={[s.banner, { backgroundColor: course.color }]}>
          <NdopPattern opacity={0.18} size={76} />
          <View style={s.codePill}>
            <Text style={s.bannerCode}>
              {course.code}
              {course.level ? ` · ${course.level}` : ''}
            </Text>
          </View>
          <Text style={s.bannerTitle}>{course.title}</Text>
          {data.role === 'student' && average !== null ? (
            <Text style={s.bannerMeta}>
              {t.average} {formatScore(locale, average)}/20
            </Text>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs} style={{ marginHorizontal: -16 }}>
          {tabs.map((tb) => (
            <Pressable key={tb.key} onPress={() => setTab(tb.key)} style={[s.tab, tab === tb.key && s.tabActive]}>
              <Text style={[s.tabText, tab === tb.key && s.tabTextActive]} numberOfLines={1}>
                {tb.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {tab === 'discussions' ? <CourseDiscussions courseId={course.id} /> : null}
        {tab === 'attendance' && userId ? <CourseAttendance courseId={course.id} isStaff={data.isStaff} userId={userId} /> : null}

        {tab === 'modules' ? (
          data.modules.length === 0 ? (
            <Empty text={t.noModules} />
          ) : (
            data.modules.map((m) => (
              <Card key={m.id}>
                <View style={s.moduleHeader}>
                  <Text style={s.moduleTitle}>{m.title}</Text>
                </View>
                {data.items
                  .filter((i) => i.module_id === m.id)
                  .map((item) =>
                    item.item_type === 'header' ? (
                      <Text key={item.id} style={s.subHeader}>
                        {item.title}
                      </Text>
                    ) : (
                      <Row key={item.id} onPress={() => openItem(item)}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <Lozenge
                            color={item.item_type === 'assignment' ? colors.ochre : item.item_type === 'link' ? colors.info : course.color}
                            size={7}
                          />
                          <Text style={[s.itemTitle, { flex: 1 }]}>{item.title}</Text>
                          {item.item_type === 'link' ? <Text style={{ color: colors.muted }}>↗</Text> : null}
                        </View>
                      </Row>
                    ),
                  )}
              </Card>
            ))
          )
        ) : null}

        {tab === 'announcements' ? (
          <>
            {data.isStaff ? (
              <Card style={{ padding: 16, gap: 12 }}>
                <Text style={s.moduleTitle}>{t.newAnnouncement}</Text>
                <Input label={t.title} value={annTitle} onChangeText={setAnnTitle} />
                <Input label={t.message} value={annBody} onChangeText={setAnnBody} multiline />
                <Button title={t.post} onPress={postAnnouncement} loading={posting} disabled={!annTitle.trim()} />
              </Card>
            ) : null}
            {data.announcements.length === 0 ? (
              <Empty text={t.noAnnouncements} />
            ) : (
              data.announcements.map((a) => (
                <Card key={a.id} style={{ padding: 16, gap: 6 }}>
                  <Text style={s.itemTitle}>{a.title}</Text>
                  <Muted>{formatDateTime(locale, a.created_at)}</Muted>
                  <Text style={s.body}>{a.body}</Text>
                </Card>
              ))
            )}
          </>
        ) : null}

        {tab === 'assignments' ? (
          data.assignments.length === 0 ? (
            <Empty text={t.noAssignments} />
          ) : (
            <Card>
              {data.assignments.map((a) => {
                const g = data.grades.find((row) => row.assignment_id === a.id);
                const done = data.submitted.has(a.id);
                return (
                  <Row key={a.id} onPress={() => router.push({ pathname: '/assignment/[id]', params: { id: a.id } })}>
                    <Text style={s.itemTitle}>{a.title}</Text>
                    <Text style={{ color: colors.muted, fontSize: 14.5, fontFamily: fonts.body }}>
                      {a.due_at ? `${t.due} ${formatDateTime(locale, a.due_at)}` : t.noDue}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                      <Badge label={t.components[a.component]} tone="brand" />
                      {data.role === 'student' ? (
                        g && g.score !== null ? (
                          <Badge label={`${formatScore(locale, g.score)} / ${formatScore(locale, a.points_possible)}`} tone="brand" />
                        ) : done ? (
                          <Badge label={t.submitted} tone="info" />
                        ) : isPast(a.due_at) ? (
                          <Badge label={t.late} tone="danger" />
                        ) : null
                      ) : null}
                    </View>
                  </Row>
                );
              })}
            </Card>
          )
        ) : null}

        {tab === 'grades' ? (
          data.isStaff ? (
            <Card style={{ padding: 16 }}>
              <Muted>{t.gradeOnWeb}</Muted>
            </Card>
          ) : (
            <>
              <Card style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={s.itemTitle}>{t.average}</Text>
                  <Muted>{t.weightNote}</Muted>
                </View>
                <Text style={s.average}>
                  {formatScore(locale, average)}
                  <Text style={{ fontSize: 16, color: colors.muted, fontFamily: fonts.medium }}>/20</Text>
                </Text>
              </Card>
              <Card>
                {data.assignments.map((a) => {
                  const g = data.grades.find((row) => row.assignment_id === a.id);
                  return (
                    <Row key={a.id} onPress={() => router.push({ pathname: '/assignment/[id]', params: { id: a.id } })}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                        <Text style={[s.itemTitle, { flex: 1 }]}>{a.title}</Text>
                        <Text style={s.score}>
                          {g && g.score !== null
                            ? `${formatScore(locale, g.score)}/${formatScore(locale, a.points_possible)}`
                            : t.notGraded}
                        </Text>
                      </View>
                      {g?.comment ? <Muted>{g.comment}</Muted> : null}
                    </Row>
                  );
                })}
              </Card>
            </>
          )
        ) : null}
      </Screen>
    </>
  );
}

const s = StyleSheet.create({
  banner: { borderRadius: 22, padding: 18, gap: 8, overflow: 'hidden', minHeight: 140, justifyContent: 'flex-end' },
  codePill: { alignSelf: 'flex-start', backgroundColor: 'rgba(18,16,12,0.32)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  bannerCode: { color: colors.chalk, fontFamily: fonts.heavy, fontSize: 13, letterSpacing: 0.4 },
  bannerTitle: { color: colors.chalk, fontFamily: fonts.display, fontSize: 26, lineHeight: 32 },
  bannerMeta: { color: 'rgba(248,243,234,0.85)', fontFamily: fonts.bold, fontSize: 15 },
  tabs: { paddingHorizontal: 16, gap: 8 },
  tab: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.board, borderColor: colors.board },
  tabText: { fontSize: 15, fontFamily: fonts.bold, color: '#453D33' },
  tabTextActive: { color: colors.chalk },
  moduleHeader: { backgroundColor: '#FAF6EF', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  moduleTitle: { fontSize: 18, fontFamily: fonts.display, color: colors.text },
  subHeader: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, fontSize: 14, fontFamily: fonts.bold, color: colors.muted },
  itemTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.text },
  body: { fontSize: 16, color: colors.text, lineHeight: 24, fontFamily: fonts.body },
  average: { fontSize: 34, fontFamily: fonts.displayBold, color: colors.text },
  score: { fontSize: 16, fontFamily: fonts.bold, color: colors.text },
});
