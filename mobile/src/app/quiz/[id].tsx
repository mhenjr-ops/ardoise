import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/text';
import { Badge, Button, Card, Empty, Loading, Muted, Screen, colors, styles as ui } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatScore, useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { AttemptReview, QuestionOption, QuizAttempt } from '@/lib/types';

type Answers = Record<string, unknown>;
type Q = AttemptReview['questions'][number];

function answered(v: unknown) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function clock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function QuizScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, loading } = useAuth();
  const { t, locale } = useI18n();
  const [attempt, setAttempt] = useState<QuizAttempt | null | undefined>(undefined);
  const [review, setReview] = useState<AttemptReview | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'offline'>('idle');
  const [remaining, setRemaining] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const answersRef = useRef<Answers>({});
  const dirty = useRef(false);
  const closed = useRef(false);
  const offset = useRef(0);
  const storageKey = `ardoise-quiz-${id}`;

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from('quiz_attempts')
      .select('id, attempt_no, option_orders, answers, started_at, deadline_at, submitted_at, score, max_score, needs_review')
      .eq('id', id)
      .maybeSingle();
    const a = (data as QuizAttempt | null) ?? null;
    const { data: r } = a ? await supabase.rpc('quiz_attempt_review', { p_attempt: a.id }) : { data: null };
    setReview((r as AttemptReview | null) ?? null);
    setAttempt(a);
    if (a && !a.submitted_at) {
      let start: Answers = a.answers ?? {};
      try {
        const local = JSON.parse((await AsyncStorage.getItem(storageKey)) ?? 'null') as Answers | null;
        if (local && Object.keys(local).length > Object.keys(start).length) {
          start = local;
          dirty.current = true;
        }
      } catch {
        // ignore
      }
      answersRef.current = start;
      setAnswers(start);
    } else {
      closed.current = true;
    }
  }, [id, storageKey]);

  useFocusEffect(
    useCallback(() => {
      if (session) load();
    }, [session, load]),
  );

  const save = useCallback(async () => {
    if (closed.current || !dirty.current || !id) return;
    dirty.current = false;
    setStatus('saving');
    const { data, error } = await supabase.rpc('save_quiz_answers', { p_attempt: id, p_answers: answersRef.current });
    if (error) {
      dirty.current = true;
      setStatus('offline');
      return;
    }
    const result = data as { status: string; saved_at?: string };
    if (result.status === 'time_up') {
      closed.current = true;
      setNotice(t.timeUp);
      load();
      return;
    }
    if (result.saved_at) offset.current = new Date(result.saved_at).getTime() - Date.now();
    setStatus('saved');
  }, [id, load, t.timeUp]);

  const submit = useCallback(async () => {
    if (closed.current || !id) return;
    closed.current = true;
    setSubmitting(true);
    const { error } = await supabase.rpc('submit_quiz_attempt', { p_attempt: id, p_answers: answersRef.current });
    setSubmitting(false);
    if (error) {
      closed.current = false;
      setNotice(t.error);
      return;
    }
    AsyncStorage.removeItem(storageKey).catch(() => {});
    setConfirming(false);
    load();
  }, [id, load, storageKey, t.error]);

  // Debounced autosave + local copy.
  useEffect(() => {
    if (!attempt || attempt.submitted_at) return;
    AsyncStorage.setItem(storageKey, JSON.stringify(answers)).catch(() => {});
    const timer = setTimeout(save, 1200);
    return () => clearTimeout(timer);
  }, [answers, attempt, save, storageKey]);

  useEffect(() => {
    if (status !== 'offline') return;
    const retry = setInterval(() => {
      dirty.current = true;
      save();
    }, 5000);
    return () => clearInterval(retry);
  }, [status, save]);

  // Countdown.
  useEffect(() => {
    if (!attempt?.deadline_at || attempt.submitted_at) return;
    const deadline = new Date(attempt.deadline_at).getTime();
    const tick = () => {
      const left = deadline - (Date.now() + offset.current);
      setRemaining(left);
      if (left <= 0 && !closed.current) {
        setNotice(t.timeUp);
        submit();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [attempt, submit, t.timeUp]);

  if (loading) return <Loading />;
  if (!session) return <Redirect href="/login" />;
  if (attempt === undefined) return <Loading />;
  if (attempt === null || !review) {
    return (
      <Screen>
        <Empty text="404" />
      </Screen>
    );
  }

  function setAnswer(qid: string, value: unknown) {
    dirty.current = true;
    const next = { ...answersRef.current, [qid]: value };
    answersRef.current = next;
    setAnswers(next);
  }

  function orderedOptions(q: Q): QuestionOption[] {
    const order = attempt?.option_orders?.[q.id];
    if (!order) return q.options;
    return order.map((oid) => q.options.find((o) => o.id === oid)).filter((o): o is QuestionOption => !!o);
  }

  function describe(q: Q, v: unknown): string | null {
    if (!answered(v)) return null;
    if (q.qtype === 'single') return q.options.find((o) => o.id === v)?.text ?? String(v);
    if (q.qtype === 'multiple' && Array.isArray(v)) return v.map((x) => q.options.find((o) => o.id === x)?.text ?? x).join(' · ');
    if (q.qtype === 'true_false') return v === true ? t.trueLabel : t.falseLabel;
    if (q.qtype === 'short' && Array.isArray(v)) return v.join(' / ');
    if (q.qtype === 'numeric' && typeof v === 'object' && v !== null) {
      const c = v as { value: number; tolerance?: number };
      return c.tolerance ? `${formatScore(locale, c.value)} ± ${formatScore(locale, c.tolerance)}` : formatScore(locale, c.value);
    }
    return String(v);
  }

  // ---------- Review ----------
  if (attempt.submitted_at) {
    return (
      <>
        <Stack.Screen options={{ title: `${t.review} · ${t.attempt} ${attempt.attempt_no}` }} />
        <Screen>
          {notice ? <Text style={s.notice}>{notice}</Text> : null}
          <Card style={{ padding: 16, gap: 6 }}>
            <Muted>{t.score}</Muted>
            <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>
              {formatScore(locale, review.score)} / {formatScore(locale, review.max_score)}
            </Text>
            {review.needs_review ? <Badge label={t.pendingReview} tone="warn" /> : null}
          </Card>
          {!review.show_keys ? <Muted>{t.keysHidden}</Muted> : null}
          {review.questions.map((q, i) => {
            const earned = q.earned === null || q.earned === undefined ? null : Number(q.earned);
            return (
              <Card key={q.id} style={{ padding: 16, gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={[s.prompt, { flex: 1 }]}>
                    {i + 1}. {q.prompt}
                  </Text>
                  <Badge
                    label={`${earned === null ? '?' : formatScore(locale, earned)}/${formatScore(locale, q.points)}`}
                    tone={earned === null ? 'warn' : earned >= Number(q.points) ? 'brand' : earned > 0 ? 'info' : 'danger'}
                  />
                </View>
                <Text style={ui.body}>
                  <Text style={{ color: colors.muted }}>{t.yourAnswer} : </Text>
                  {describe(q, q.answer) ?? t.noAnswer}
                </Text>
                {review.show_keys && q.qtype !== 'essay' && q.correct !== null ? (
                  <Text style={{ color: colors.brandDark }}>
                    {t.expected} : {describe(q, q.correct)}
                  </Text>
                ) : null}
                {review.show_keys && q.explanation ? <Muted>{q.explanation}</Muted> : null}
              </Card>
            );
          })}
        </Screen>
      </>
    );
  }

  // ---------- Runner ----------
  const count = review.questions.filter((q) => answered(answers[q.id])).length;
  const low = remaining !== null && remaining < 60_000;

  return (
    <>
      <Stack.Screen options={{ title: `${t.quiz} · ${t.attempt} ${attempt.attempt_no}` }} />
      <View style={s.bar}>
        {remaining !== null ? (
          <Text style={[s.timer, low && { backgroundColor: colors.dangerSoft, color: colors.danger }]}>
            {t.timeLeft} {clock(remaining)}
          </Text>
        ) : null}
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          {count} {t.answered} {review.questions.length}
        </Text>
        <Text style={{ marginLeft: 'auto', fontSize: 12, color: status === 'offline' ? colors.warn : colors.muted }}>
          {status === 'saving' ? t.saving : status === 'saved' ? `✓ ${t.saved}` : status === 'offline' ? t.offline : ''}
        </Text>
      </View>
      <Screen>
        {notice ? <Text style={s.notice}>{notice}</Text> : null}
        {review.questions.map((q, i) => {
          const value = answers[q.id];
          return (
            <Card key={q.id} style={{ padding: 16, gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Text style={[s.prompt, { flex: 1 }]}>
                  {i + 1}. {q.prompt}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {formatScore(locale, q.points)} {t.points}
                </Text>
              </View>

              {q.qtype === 'single' || q.qtype === 'multiple'
                ? orderedOptions(q).map((o) => {
                    const selected = q.qtype === 'single' ? value === o.id : Array.isArray(value) && (value as string[]).includes(o.id);
                    return (
                      <Pressable
                        key={o.id}
                        accessibilityRole={q.qtype === 'single' ? 'radio' : 'checkbox'}
                        accessibilityState={{ checked: selected }}
                        onPress={() => {
                          if (q.qtype === 'single') setAnswer(q.id, o.id);
                          else {
                            const list = Array.isArray(value) ? (value as string[]) : [];
                            setAnswer(q.id, selected ? list.filter((x) => x !== o.id) : [...list, o.id]);
                          }
                        }}
                        style={[s.option, selected && s.optionOn]}
                      >
                        <View style={[q.qtype === 'single' ? s.radio : s.check, selected && s.markOn]} />
                        <Text style={{ flex: 1, fontSize: 15, color: colors.text }}>{o.text}</Text>
                      </Pressable>
                    );
                  })
                : null}

              {q.qtype === 'true_false' ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[true, false].map((v) => (
                    <Pressable
                      key={String(v)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: value === v }}
                      onPress={() => setAnswer(q.id, v)}
                      style={[s.option, { flex: 1 }, value === v && s.optionOn]}
                    >
                      <View style={[s.radio, value === v && s.markOn]} />
                      <Text style={{ fontSize: 15 }}>{v ? t.trueLabel : t.falseLabel}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {q.qtype === 'short' || q.qtype === 'numeric' || q.qtype === 'essay' ? (
                <TextInput
                  value={typeof value === 'string' ? value : ''}
                  onChangeText={(text) => setAnswer(q.id, text)}
                  keyboardType={q.qtype === 'numeric' ? 'decimal-pad' : 'default'}
                  multiline={q.qtype === 'essay'}
                  style={[ui.input, q.qtype === 'essay' && ui.multiline, q.qtype === 'essay' && { minHeight: 160 }]}
                  placeholderTextColor="#94A3B8"
                />
              ) : null}
            </Card>
          );
        })}

        {confirming ? (
          <View style={{ gap: 8 }}>
            <Button title={t.confirmSubmit} onPress={submit} loading={submitting} />
            <Button title={t.cancel} onPress={() => setConfirming(false)} variant="ghost" disabled={submitting} />
          </View>
        ) : (
          <Button title={t.submitQuiz} onPress={() => setConfirming(true)} />
        )}
      </Screen>
    </>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  timer: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    backgroundColor: '#F1E9DC',
    color: colors.text,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  notice: { backgroundColor: colors.warnSoft, color: colors.warn, padding: 12, borderRadius: 10 },
  prompt: { fontSize: 16, fontWeight: '600', color: colors.text, lineHeight: 22 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    minHeight: 52,
  },
  optionOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#A8977D' },
  check: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: '#A8977D' },
  markOn: { borderColor: colors.brand, backgroundColor: colors.brand },
});
