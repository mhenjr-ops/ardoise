import * as DocumentPicker from 'expo-document-picker';
import { File as FsFile } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Badge, Button, Card, Empty, Input, Loading, Muted, Screen, colors, styles } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatScore, useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { isPast, type Assignment, type Grade, type Quiz, type QuizAttempt, type Submission } from '@/lib/types';

const MAX_BYTES = 10 * 1024 * 1024;

type Picked = { uri: string; name: string; mimeType: string; size?: number };

function safeName(name: string) {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot).toLowerCase().replace(/[^.a-z0-9]/g, '') : '';
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .slice(0, 60);
  return `${base || 'fichier'}${ext}`;
}

export default function AssignmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, loading } = useAuth();
  const { t, locale } = useI18n();
  const [assignment, setAssignment] = useState<Assignment | null | undefined>(undefined);
  const [role, setRole] = useState<string | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [starting, setStarting] = useState(false);
  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!id || !userId) return;
    const { data } = await supabase
      .from('assignments')
      .select('id, course_id, title, description, due_at, points_possible, weight, component, submission_types')
      .eq('id', id)
      .maybeSingle();
    if (!data) {
      setAssignment(null);
      return;
    }
    const a = data as Assignment;
    const [{ data: r }, { data: sub }, { data: g }] = await Promise.all([
      supabase.rpc('course_role', { course: a.course_id }),
      supabase
        .from('submissions')
        .select('id, assignment_id, body, file_path, file_name, submitted_at')
        .eq('assignment_id', a.id)
        .eq('student_id', userId)
        .maybeSingle(),
      supabase
        .from('grades')
        .select('assignment_id, student_id, score, comment')
        .eq('assignment_id', a.id)
        .eq('student_id', userId)
        .maybeSingle(),
    ]);
    if (a.submission_types.includes('quiz')) {
      const { data: qz } = await supabase
        .from('quizzes')
        .select('id, assignment_id, time_limit_minutes, attempts_allowed, show_results')
        .eq('assignment_id', a.id)
        .maybeSingle();
      setQuiz((qz as Quiz | null) ?? null);
      if (qz) {
        const { data: at } = await supabase
          .from('quiz_attempts')
          .select('id, attempt_no, option_orders, answers, started_at, deadline_at, submitted_at, score, max_score, needs_review')
          .eq('quiz_id', (qz as Quiz).id)
          .eq('student_id', userId)
          .order('attempt_no', { ascending: false });
        setAttempts((at ?? []) as QuizAttempt[]);
      }
    }
    setAssignment(a);
    setRole((r as string | null) ?? null);
    const s = (sub as Submission | null) ?? null;
    setSubmission(s);
    setGrade((g as Grade | null) ?? null);
    setBody((prev) => prev || s?.body || '');
    if (s?.file_path) {
      const { data: signed } = await supabase.storage.from('submissions').createSignedUrl(s.file_path, 60 * 30);
      setFileUrl(signed?.signedUrl ?? null);
    } else {
      setFileUrl(null);
    }
  }, [id, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) return <Loading />;
  if (!session) return <Redirect href="/login" />;
  if (assignment === undefined) return <Loading />;
  if (assignment === null) return <Screen><Empty text="404" /></Screen>;

  const isQuiz = assignment.submission_types.includes('quiz');
  const openAttempt = attempts.find((a) => !a.submitted_at && !isPast(a.deadline_at));
  const canStart = !!quiz && (!!openAttempt || attempts.length < quiz.attempts_allowed);

  async function startQuiz() {
    if (!quiz) return;
    setStarting(true);
    const { data, error } = await supabase.rpc('start_quiz_attempt', { p_quiz: quiz.id });
    setStarting(false);
    if (error || !data) {
      setMessage({ tone: 'error', text: error?.message.includes('no_attempts_left') ? t.noAttemptsLeft : t.error });
      return;
    }
    router.push({ pathname: '/quiz/[id]', params: { id: data as string } });
  }

  const allowText = assignment.submission_types.includes('text');
  const allowFile = assignment.submission_types.includes('file');
  const isStudent = role === 'student';
  const late = isPast(assignment.due_at);

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setMessage({ tone: 'error', text: t.cameraDenied });
      return;
    }
    // quality 0.6 keeps photos of handwritten work readable but light on data.
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPicked({ uri: asset.uri, name: asset.fileName ?? `photo-${Date.now()}.jpg`, mimeType: asset.mimeType ?? 'image/jpeg', size: asset.fileSize });
    }
  }

  async function choosePhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPicked({ uri: asset.uri, name: asset.fileName ?? `photo-${Date.now()}.jpg`, mimeType: asset.mimeType ?? 'image/jpeg', size: asset.fileSize });
    }
  }

  async function chooseFile() {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPicked({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? 'application/octet-stream', size: asset.size });
    }
  }

  async function submit() {
    if (!assignment || !userId) return;
    setMessage(null);
    if (!body.trim() && !picked) {
      setMessage({ tone: 'error', text: t.emptySubmission });
      return;
    }
    if (picked?.size && picked.size > MAX_BYTES) {
      setMessage({ tone: 'error', text: t.fileTooBig });
      return;
    }
    setBusy(true);
    try {
      let filePath: string | null = submission?.file_path ?? null;
      let fileName: string | null = submission?.file_name ?? null;
      if (picked) {
        const bytes = await new FsFile(picked.uri).arrayBuffer();
        if (bytes.byteLength > MAX_BYTES) {
          setMessage({ tone: 'error', text: t.fileTooBig });
          return;
        }
        filePath = `${assignment.course_id}/${assignment.id}/${userId}/${Date.now()}-${safeName(picked.name)}`;
        fileName = picked.name;
        const { error: upErr } = await supabase.storage
          .from('submissions')
          .upload(filePath, bytes, { contentType: picked.mimeType, upsert: false });
        if (upErr) throw upErr;
      }
      const { error } = await supabase.from('submissions').upsert(
        { assignment_id: assignment.id, student_id: userId, body: body.trim() || null, file_path: filePath, file_name: fileName },
        { onConflict: 'assignment_id,student_id' },
      );
      if (error) throw error;
      setPicked(null);
      setMessage({ tone: 'ok', text: t.sent });
      await load();
    } catch {
      setMessage({ tone: 'error', text: t.error });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: assignment.title }} />
      <Screen>
        <Card style={{ padding: 16, gap: 10 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{assignment.title}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Badge label={t.components[assignment.component]} tone="brand" />
            <Badge label={`${formatScore(locale, assignment.points_possible)} ${t.points}`} />
            <Badge label={`×${formatScore(locale, assignment.weight)}`} />
          </View>
          <Text style={{ color: late ? colors.danger : colors.muted, fontSize: 14 }}>
            {assignment.due_at ? `${t.due} ${formatDateTime(locale, assignment.due_at)}` : t.noDue}
          </Text>
          {assignment.description ? (
            <View style={{ gap: 4, marginTop: 4 }}>
              <Text style={{ fontWeight: '700', color: '#453D33' }}>{t.instructions}</Text>
              <Text style={styles.body} selectable>
                {assignment.description}
              </Text>
            </View>
          ) : null}
        </Card>

        {isStudent && grade && grade.score !== null ? (
          <Card style={{ padding: 16, gap: 6, backgroundColor: colors.brandSoft, borderColor: '#C7DAD2' }}>
            <Text style={{ color: colors.brandDark, fontWeight: '600' }}>{t.yourGrade}</Text>
            <Text style={{ color: colors.brandDark, fontSize: 32, fontWeight: '700' }}>
              {formatScore(locale, grade.score)}
              <Text style={{ fontSize: 16, fontWeight: '400' }}> / {formatScore(locale, assignment.points_possible)}</Text>
            </Text>
            {grade.comment ? (
              <>
                <Text style={{ color: colors.brandDark, fontWeight: '600', marginTop: 6 }}>{t.feedback}</Text>
                <Text style={styles.body}>{grade.comment}</Text>
              </>
            ) : null}
          </Card>
        ) : null}

        {isStudent && isQuiz && quiz ? (
          <Card style={{ padding: 16, gap: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '700' }}>{t.quiz}</Text>
            <Muted>
              {`${t.timeLimit}: ${quiz.time_limit_minutes ? `${quiz.time_limit_minutes} ${t.minutes}` : t.unlimited} · ${attempts.length} ${t.attemptsUsed} ${quiz.attempts_allowed}`}
            </Muted>
            {message ? <Text style={{ color: colors.danger }}>{message.text}</Text> : null}
            {canStart ? (
              <Button title={openAttempt ? t.resumeQuiz : t.startQuiz} onPress={startQuiz} loading={starting} />
            ) : (
              <Badge label={t.noAttemptsLeft} tone="warn" />
            )}
            {attempts.map((at) => (
              <Pressable
                key={at.id}
                onPress={() => router.push({ pathname: '/quiz/[id]', params: { id: at.id } })}
                style={s.attemptRow}
              >
                <Text style={{ fontWeight: '600', flex: 1 }}>
                  {t.attempt} {at.attempt_no}
                </Text>
                {!at.submitted_at ? (
                  <Badge label={t.inProgress} tone="info" />
                ) : at.needs_review ? (
                  <Badge label={t.pendingReview} tone="warn" />
                ) : (
                  <Badge label={`${formatScore(locale, at.score)} / ${formatScore(locale, at.max_score)}`} tone="brand" />
                )}
              </Pressable>
            ))}
          </Card>
        ) : null}

        {isStudent && !isQuiz ? (
          <Card style={{ padding: 16, gap: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '700' }}>{t.yourWork}</Text>
              {submission ? (
                <Badge label={t.submitted} tone="info" />
              ) : (
                <Badge label={late ? t.late : t.notSubmitted} tone={late ? 'danger' : 'neutral'} />
              )}
            </View>
            {submission ? <Muted>{`${t.submittedOn} ${formatDateTime(locale, submission.submitted_at)}`}</Muted> : null}
            {submission?.file_name ? (
              <Pressable onPress={() => fileUrl && Linking.openURL(fileUrl)} disabled={!fileUrl}>
                <Text style={{ color: colors.brand, fontWeight: '600' }}>📎 {submission.file_name}</Text>
              </Pressable>
            ) : null}

            {allowText ? <Input label={t.writtenAnswer} value={body} onChangeText={setBody} multiline /> : null}

            {allowFile ? (
              <View style={{ gap: 8 }}>
                <Button title={t.takePhoto} onPress={takePhoto} variant="secondary" />
                <Button title={t.choosePhoto} onPress={choosePhoto} variant="secondary" />
                <Button title={t.chooseFile} onPress={chooseFile} variant="secondary" />
                {picked ? (
                  <View style={s.picked}>
                    <Text style={{ flex: 1, color: colors.text }} numberOfLines={1}>
                      {picked.name}
                    </Text>
                    <Pressable onPress={() => setPicked(null)} hitSlop={10}>
                      <Text style={{ color: colors.danger, fontWeight: '600' }}>{t.removeFile}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : null}

            {message ? (
              <Text style={{ color: message.tone === 'ok' ? colors.brandDark : colors.danger }}>{message.text}</Text>
            ) : null}
            <Button title={busy ? t.sending : submission ? t.resubmit : t.submit} onPress={submit} loading={busy} />
          </Card>
        ) : null}
        {!isStudent ? (
          <Card style={{ padding: 16 }}>
            <Muted>{t.gradeOnWeb}</Muted>
          </Card>
        ) : null}
      </Screen>
    </>
  );
}

const s = StyleSheet.create({
  attemptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  picked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F1E9DC',
  },
});
