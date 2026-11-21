import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Ring } from '@/components/ndop';
import { Text } from '@/components/text';
import { Badge, Button, Card, Empty, Loading, Row, Screen, Slate, colors, fonts } from '@/components/ui';
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

  if (loading || rows === null) return <Loading />;

  return (
    <>
      <Screen>
        {rows.length === 0 ? <Empty text={t.noResults} /> : null}
        {rows.map((r) => {
          const d = one(r.deliberation);
          const sem = one(d?.semester);
          const avg = r.semester_average === null ? null : Number(r.semester_average);
          return (
            <View key={r.deliberation_id} style={{ gap: 10 }}>
              <Slate style={{ gap: 14 }}>
                <View style={{ gap: 4 }}>
                  <Text style={st.sem}>
                    {sem?.label} · {one(sem?.academic_year)?.label}
                  </Text>
                  <Text style={st.prog}>
                    {one(d?.programme)?.name} · {d?.level}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
                  <Ring value={avg === null ? 0 : avg / 20} size={72} stroke={7} color={colors.ochre} track="rgba(248,243,234,0.16)" />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={st.avg}>
                      {formatScore(locale, avg)}
                      <Text style={st.avgSuffix}>/20</Text>
                    </Text>
                    <Text style={st.sem}>
                      {r.credits_earned} / {r.credits_total} {t.credits.toLowerCase()}
                    </Text>
                  </View>
                </View>
                <View style={[st.decision, { backgroundColor: r.decision === 'resit' ? colors.danger : r.decision === 'incomplete' ? 'rgba(248,243,234,0.16)' : colors.ochre }]}>
                  <Text style={[st.decisionText, r.decision === 'resit' || r.decision === 'incomplete' ? { color: colors.chalk } : null]}>
                    {t.decisions[r.decision]}
                  </Text>
                </View>
              </Slate>
              <Card>
                {r.ue_results.map((u) => (
                  <Row key={u.ue_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={st.ue}>{u.title}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={st.meta}>
                          {u.code} · {u.credits} {t.credits.toLowerCase()}
                        </Text>
                        <Badge
                          label={t.ueStatus[u.status]}
                          tone={u.status === 'validated' ? 'success' : u.status === 'compensated' ? 'warn' : u.status === 'failed' ? 'danger' : 'neutral'}
                        />
                      </View>
                    </View>
                    <Text style={st.final}>{formatScore(locale, u.final)}</Text>
                  </Row>
                ))}
              </Card>
            </View>
          );
        })}
        {rows.length && WEB_URL ? (
          <Button title={t.openTranscript} variant="secondary" onPress={() => Linking.openURL(`${WEB_URL}/results`)} />
        ) : null}
      </Screen>
    </>
  );
}

const st = StyleSheet.create({
  sem: { color: 'rgba(248,243,234,0.75)', fontFamily: fonts.medium, fontSize: 15 },
  prog: { color: colors.chalk, fontFamily: fonts.display, fontSize: 22, lineHeight: 28 },
  avg: { color: colors.chalk, fontFamily: fonts.displayBold, fontSize: 40 },
  avgSuffix: { color: 'rgba(248,243,234,0.6)', fontFamily: fonts.medium, fontSize: 18 },
  decision: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  decisionText: { fontFamily: fonts.heavy, fontSize: 15, color: '#12100C' },
  ue: { fontSize: 16, fontFamily: fonts.bold, color: colors.text },
  meta: { fontSize: 14, color: colors.muted, fontFamily: fonts.body },
  final: { fontSize: 22, fontFamily: fonts.displayBold, color: colors.text, fontVariant: ['tabular-nums'] },
});
