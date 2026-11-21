import { Redirect } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Input, colors } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { isConfigured, supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const { session } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session) return <Redirect href="/" />;

  async function onSubmit() {
    setError(null);
    setBusy(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (authError) setError(t.invalidLogin);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.board }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={s.hero}>
            <View style={s.topRow}>
              <View style={s.logo}>
                <Text style={s.logoText}>A</Text>
              </View>
              <Pressable onPress={() => setLocale(locale === 'fr' ? 'en' : 'fr')} hitSlop={12}>
                <Text style={s.lang}>
                  {locale.toUpperCase()} → {(locale === 'fr' ? 'en' : 'fr').toUpperCase()}
                </Text>
              </Pressable>
            </View>
            <Text style={s.brand}>Ardoise</Text>
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
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  hero: { padding: 24, paddingTop: 16, gap: 10 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  logo: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  lang: { color: '#CBD5E1', fontWeight: '700', fontSize: 13 },
  brand: { color: colors.chalk, fontSize: 34, fontWeight: '700' },
  tagline: { color: '#CBD5E1', fontSize: 16, lineHeight: 23 },
  sheet: {
    flex: 1,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 16,
    marginTop: 24,
  },
  error: { color: colors.danger, fontSize: 14 },
});
