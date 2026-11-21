import { Redirect } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogoMark, NdopPattern } from '@/components/ndop';
import { Text } from '@/components/text';
import { Button, Input, colors, fonts } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { isConfigured, supabase } from '@/lib/supabase';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? '';
// Demo buttons only in builds made for showing Ardoise (EXPO_PUBLIC_DEMO=on).
const DEMO = process.env.EXPO_PUBLIC_DEMO === 'on' && WEB_URL.startsWith('http');

export default function LoginScreen() {
  const { session } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoBusy, setDemoBusy] = useState<'student' | 'teacher' | null>(null);

  if (session) return <Redirect href="/" />;

  async function demo(role: 'student' | 'teacher') {
    setError(null);
    setDemoBusy(role);
    try {
      const res = await fetch(`${WEB_URL}/api/demo-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const tokens = (await res.json()) as { access_token?: string; refresh_token?: string };
      if (!res.ok || !tokens.access_token || !tokens.refresh_token) throw new Error('demo');
      const { error: e } = await supabase.auth.setSession({ access_token: tokens.access_token, refresh_token: tokens.refresh_token });
      if (e) throw e;
    } catch {
      setError(t.error);
    } finally {
      setDemoBusy(null);
    }
  }

  async function onSubmit() {
    setError(null);
    setBusy(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (authError) setError(t.invalidLogin);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.board }} edges={['top']}>
      <NdopPattern opacity={0.1} size={96} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={s.hero}>
            <View style={s.topRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <LogoMark size={44} />
                <Text style={s.word}>Ardoise</Text>
              </View>
              <View style={s.segment}>
                {(['fr', 'en'] as const).map((l) => (
                  <Pressable key={l} onPress={() => setLocale(l)} style={[s.segItem, locale === l && s.segOn]} hitSlop={6}>
                    <Text style={[s.segText, locale === l && { color: colors.board }]}>{l.toUpperCase()}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <Text style={s.tagline}>{t.tagline}</Text>
          </View>

          <View style={s.sheet}>
            {!isConfigured ? <Text style={s.error}>{t.notConfigured}</Text> : null}
            <Input
              label={t.email}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <Input
              label={t.password}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              onSubmitEditing={onSubmit}
            />
            {error ? <Text style={s.error}>{error}</Text> : null}
            <Button title={t.signIn} onPress={onSubmit} loading={busy} disabled={!email || !password || !isConfigured} />
            {DEMO && isConfigured ? (
              <View style={s.demo}>
                <Text style={s.demoTitle}>{t.tryDemo}</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Button title={t.asStudent} variant="accent" onPress={() => demo('student')} loading={demoBusy === 'student'} disabled={!!demoBusy} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button title={t.asTeacher} variant="secondary" onPress={() => demo('teacher')} loading={demoBusy === 'teacher'} disabled={!!demoBusy} />
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  hero: { padding: 24, paddingTop: 20, gap: 28, minHeight: 300, justifyContent: 'space-between' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  word: { color: colors.chalk, fontFamily: fonts.displayBold, fontSize: 26 },
  tagline: { color: colors.chalk, fontFamily: fonts.display, fontSize: 30, lineHeight: 38, marginBottom: 8 },
  segment: { flexDirection: 'row', backgroundColor: 'rgba(248,243,234,0.1)', borderRadius: 10, padding: 3 },
  segItem: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  segOn: { backgroundColor: colors.chalk },
  segText: { color: 'rgba(248,243,234,0.8)', fontFamily: fonts.bold, fontSize: 13.5 },
  sheet: {
    flex: 1,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingTop: 28,
    gap: 16,
  },
  error: { color: colors.danger, fontSize: 15, fontFamily: fonts.bold },
  demo: { marginTop: 8, paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.border, gap: 10 },
  demoTitle: { fontFamily: fonts.bold, color: colors.muted, fontSize: 15, textAlign: 'center' },
});
