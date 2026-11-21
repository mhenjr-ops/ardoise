import { Redirect, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Badge, Button, Card, Empty, Loading, Muted, Row, Screen, colors } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatScore, useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { Decision, UEResult } from '@/lib/types';

type One<T> = T | T[] | null;
const one = <T,>(v: One<T> | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

type ResultRow = {
  deliberation_id: string;
  ue_results: UEResult[];
  semester_average: number | null;
  credits_earned: number;
  credits_total: number;
  decision: Decision;
  deliberation: One<{
    level: string;
    published_at: string | null;
    programme: One<{ name: string }>;
    semester: One<{ label: string; academic_year: One<{ label: string }> }>;
  }>;
};

const tone: Record<Decision, 'brand' | 'info' | 'danger' | 'neutral'> = {
  admitted: 'brand',
  admitted_compensation: 'info',
  resit: 'danger',
  incomplete: 'neutral',
};

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? '';

export default function ResultsScreen() {
  const { session, loading } = useAuth();
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<ResultRow[] | null>(null);
  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('deliberation_results')
      .select(
        'deliberation_id, ue_results, semester_average, credits_earned, credits_total, decision, deliberation:deliberations(level, published_at, programme:programmes(name), semester:semesters(label, academic_year:academic_years(label)))',
      )
      .eq('student_id', userId);
    const list = ((data ?? []) as unknown as ResultRow[]).sort((a, b) =>
      String(one(b.deliberation)?.published_at ?? '').localeCompare(String(one(a.deliberation)?.published_at ?? '')),
    );
    setRows(list);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) return <Loading />;
  if (!session) return <Redirect href="/login" />;
  if (rows === null) return <Loading />;

  return (
    <>
      <Stack.Screen options={{ title: t.myResults }} />
      <Screen>
        {rows.length === 0 ? <Empty text={t.noResults} /> : null}
        {rows.map((r) => {
          const d = one(r.deliberation);
          const sem = one(d?.semester);
          return (
            <Card key={r.deliberation_id}>
              <View style={{ padding: 16, gap: 6, backgroundColor: '#F8FAFC' }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>
                  {one(d?.programme)?.name} · {d?.level}
                </Text>
                <Muted>
                  {sem?.label} · {one(sem?.academic_year)?.label}
                </Muted>
                <Badge label={t.decisions[r.decision]} tone={tone[r.decision]} />
              </View>
              <View style={{ flexDirection: 'row', padding: 16, gap: 24 }}>
                <View>
                  <Muted>{t.average}</Muted>
                  <Text style={{ fontSize: 26, fontWeight: '700' }}>
                    {formatScore(locale, r.semester_average === null ? null : Number(r.semester_average))}
                    <Text style={{ fontSize: 14, color: colors.muted }}>/20</Text>
                  </Text>
                </View>
                <View>
                  <Muted>{t.credits}</Muted>
                  <Text style={{ fontSize: 26, fontWeight: '700' }}>
                    {r.credits_earned}
                    <Text style={{ fontSize: 14, color: colors.muted }}> / {r.credits_total}</Text>
                  </Text>
                </View>
              </View>
              {r.ue_results.map((u) => (
                <Row key={u.ue_id}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{u.title}</Text>
                      <Muted>
                        {u.code} · {u.credits} {t.credits.toLowerCase()}
                      </Muted>
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: '700' }}>{formatScore(locale, u.final)}</Text>
                  </View>
                  <Badge
                    label={t.ueStatus[u.status]}
                    tone={u.status === 'validated' ? 'brand' : u.status === 'compensated' ? 'warn' : u.status === 'failed' ? 'danger' : 'neutral'}
                  />
                </Row>
              ))}
            </Card>
          );
        })}
        {rows.length && WEB_URL ? (
          <Button title={t.openTranscript} variant="secondary" onPress={() => Linking.openURL(`${WEB_URL}/results`)} />
        ) : null}
      </Screen>
    </>
  );
}
