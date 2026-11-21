import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { Card, Empty, Loading, Muted, Screen, styles } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatDateTime, useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

type PageRow = { id: string; title: string; body: string; updated_at: string };

export default function PageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, loading } = useAuth();
  const { locale } = useI18n();
  const [page, setPage] = useState<PageRow | null | undefined>(undefined);

  useEffect(() => {
    if (!id || !session) return;
    supabase
      .from('pages')
      .select('id, title, body, updated_at')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => setPage((data as PageRow | null) ?? null));
  }, [id, session]);

  if (loading) return <Loading />;
  if (!session) return <Redirect href="/login" />;
  if (page === undefined) return <Loading />;
  if (page === null) return <Screen><Empty text="404" /></Screen>;

  return (
    <>
      <Stack.Screen options={{ title: page.title }} />
      <Screen>
        <Card style={{ padding: 18, gap: 12 }}>
          <Text style={{ fontSize: 22, fontWeight: '700' }}>{page.title}</Text>
          <Text style={[styles.body, { fontSize: 16, lineHeight: 25 }]} selectable>
            {page.body}
          </Text>
          <Muted>{formatDateTime(locale, page.updated_at)}</Muted>
        </Card>
      </Screen>
    </>
  );
}
