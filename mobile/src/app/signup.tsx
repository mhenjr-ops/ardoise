import { Link, Redirect, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogoMark, NdopPattern } from '@/components/ndop';
import { Text } from '@/components/text';
import { Button, Input, colors, fonts } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { isConfigured, supabase } from '@/lib/supabase';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? '';

type School = { slug: string; name: string };

/**
 * A student creates their account: university, matricule, name, email, password. The confirmation
 * link finishes it (on the web), linking the matricule and the courses the student registered for.
 */
export default function SignUpScreen() {
  const { session } = useAuth();
  const { t, locale } = useI18n();
  const [schools, setSchools] = useState<School[]>([]);
  const [query, setQuery] = useState('');
  const [school, setSchool] = useState<School | null>(null);
  const [matricule, setMatricule] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase.rpc('school_directory').then(({ data }) => setSchools((data ?? []) as School[]));
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? schools.filter((s) => s.name.toLowerCase().includes(q) || s.slug.includes(q)) : schools;
  }, [schools, query]);

  if (session) return <Redirect href="/" />;

  async function onSubmit() {
    setError(null);
    if (!school || matricule.trim().length < 2 || fullName.trim().length < 2 || !email.includes('@') || password.length < 8) {
      setError(t.fillAll);
      return;
    }
    setBusy(true);
    const { data, error: e } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim(), locale, school_code: school.slug, matricule: matricule.trim().toUpperCase() },
        emailRedirectTo: WEB_URL ? `${WEB_URL}/auth/callback` : undefined,
      },
    });
    setBusy(false);
    if (e) {
      setError(e.status === 429 || e.code === 'over_email_send_rate_limit' ? t.emailLimit : t.error);
      return;
    }
    // An email that already has an account comes back without an identity, and no email is sent.
    if (data.user && (data.user.identities ?? []).length === 0) {
      setError(t.accountExists);
      return;
    }
    setDone(true);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.board }} edges={['top']}>
      <NdopPattern opacity={0.1} size={96} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={s.hero}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <LogoMark size={36} />
              <Text style={s.word}>Ardoise</Text>
            </View>
            <Text style={s.heading}>{t.signUpTitle}</Text>
          </View>
          <View style={s.sheet}>
            {done ? (
              <>
                <Text style={s.notice}>{t.checkEmail}</Text>
                <Button title={t.signIn} onPress={() => router.replace('/login')} />
              </>
            ) : (
              <>
                <Text style={s.body}>{t.signUpIntro}</Text>
                <Text style={s.label}>{t.university}</Text>
                {schools.length > 6 ? <Input label={t.findUniversity} value={query} onChangeText={setQuery} /> : null}
                <View style={s.list}>
                  {shown.map((sc) => {
                    const on = school?.slug === sc.slug;
                    return (
                      <Pressable
                        key={sc.slug}
                        onPress={() => setSchool(sc)}
                        style={[s.school, on && s.schoolOn]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                      >
                        <Text style={[s.schoolName, on && { color: colors.chalk }]}>{sc.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Input label={t.matricule} value={matricule} onChangeText={setMatricule} autoCapitalize="characters" autoCorrect={false} />
                <Input label={t.nameAsOnRecords} value={fullName} onChangeText={setFullName} autoComplete="name" textContentType="name" />
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
                  autoComplete="new-password"
                  textContentType="newPassword"
                />
                <Text style={s.hint}>{t.passwordHint}</Text>
                {error ? <Text style={s.error}>{error}</Text> : null}
                <Button title={t.createAccount} onPress={onSubmit} loading={busy} disabled={!isConfigured} />
                <View style={s.row}>
                  <Text style={s.body}>{t.haveAccount}</Text>
                  <Link href="/login" asChild>
                    <Pressable hitSlop={8}>
                      <Text style={s.link}>{t.signIn}</Text>
                    </Pressable>
                  </Link>
                </View>
                <Text style={s.hint}>{t.staffNote}</Text>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  hero: { padding: 24, paddingTop: 16, gap: 18 },
  word: { color: colors.chalk, fontFamily: fonts.displayBold, fontSize: 22 },
  heading: { color: colors.chalk, fontFamily: fonts.display, fontSize: 28, lineHeight: 34 },
  sheet: { flex: 1, backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingTop: 26, gap: 14 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.muted },
  label: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  list: { gap: 8 },
  school: { borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 14, paddingVertical: 12 },
  schoolOn: { backgroundColor: colors.board, borderColor: colors.board },
  schoolName: { fontFamily: fonts.bold, fontSize: 15.5, color: colors.text },
  hint: { fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: colors.muted },
  error: { color: colors.danger, fontSize: 15, fontFamily: fonts.bold },
  notice: { color: colors.leaf, fontSize: 16, lineHeight: 22, fontFamily: fonts.bold },
  link: { fontFamily: fonts.bold, fontSize: 15.5, color: colors.board, textDecorationLine: 'underline' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
