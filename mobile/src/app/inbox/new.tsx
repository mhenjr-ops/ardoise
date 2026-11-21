import { Stack, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/text';
import { Avatar, Badge, Button, Card, Input, Loading, Row, Screen, colors, fonts } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

type Contact = { id: string; full_name: string; email: string; office: boolean; courses: string | null };

export default function NewMessageScreen() {
  const { t } = useI18n();
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Contact[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.rpc('message_contacts').then(({ data }) => setContacts((data ?? []) as Contact[]));
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!contacts || !q) return [];
    return contacts
      .filter((c) => !picked.some((p) => p.id === c.id))
      .filter((c) => `${c.full_name} ${c.email} ${c.courses ?? ''}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [contacts, query, picked]);

  async function send() {
    if (!picked.length || !body.trim()) {
      setError(t.pickRecipient);
      return;
    }
    setBusy(true);
    setError('');
    const { data, error: e } = await supabase.rpc('start_conversation', {
      p_recipients: picked.map((p) => p.id),
      p_subject: subject.trim(),
      p_body: body.trim(),
    });
    setBusy(false);
    if (e || !data) {
      setError(t.error);
      return;
    }
    router.replace({ pathname: '/inbox/[id]', params: { id: data as string } });
  }

  if (!contacts) return <Loading />;

  return (
    <Screen>
      <Stack.Screen options={{ title: t.newMessage }} />
      <View style={{ gap: 6 }}>
        <Text style={s.label}>{t.to}</Text>
        {picked.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {picked.map((p) => (
              <Pressable key={p.id} onPress={() => setPicked(picked.filter((x) => x.id !== p.id))} style={s.chip}>
                <Text style={s.chipText}>{p.full_name || p.email}</Text>
                <Text style={[s.chipText, { opacity: 0.6 }]}>×</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t.searchPeople}
          placeholderTextColor="#A8977D"
          style={s.search}
          autoCapitalize="none"
        />
        {query.trim() ? (
          <Card>
            {matches.length === 0 ? (
              <Text style={{ padding: 14, color: colors.muted, fontFamily: fonts.body }}>{t.noContacts}</Text>
            ) : (
              matches.map((c) => (
                <Row
                  key={c.id}
                  onPress={() => {
                    setPicked([...picked, c]);
                    setQuery('');
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
                >
                  <Avatar name={c.full_name || c.email} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.name}>{c.full_name || c.email}</Text>
                    <Text style={s.meta}>{c.courses || c.email}</Text>
                  </View>
                  {c.office ? <Badge label={t.office} tone="info" /> : null}
                </Row>
              ))
            )}
          </Card>
        ) : null}
      </View>
      <Input label={t.subject} value={subject} onChangeText={setSubject} maxLength={200} />
      <Input label={t.message} value={body} onChangeText={setBody} multiline maxLength={10000} />
      {error ? <Text style={{ color: colors.danger, fontFamily: fonts.bold }}>{error}</Text> : null}
      <Button title={t.send} onPress={send} loading={busy} />
    </Screen>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 15, fontFamily: fonts.bold, color: '#453D33' },
  search: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D2C3AB',
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    fontSize: 17,
    fontFamily: fonts.body,
    color: colors.text,
  },
  chip: { flexDirection: 'row', gap: 6, backgroundColor: colors.board, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { color: colors.chalk, fontFamily: fonts.bold, fontSize: 14 },
  name: { fontSize: 16, fontFamily: fonts.bold, color: colors.text },
  meta: { fontSize: 14, color: colors.muted, fontFamily: fonts.body },
});
