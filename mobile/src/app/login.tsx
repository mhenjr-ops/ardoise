import { Link, Redirect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BotCheck } from '@/components/bot-check';
import { LogoMark, NdopPattern } from '@/components/ndop';
import { Text } from '@/components/text';
import { Button, Input, Loading, colors, fonts } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import type { BotCheckHandle } from '@/lib/bot-check';
import { useI18n } from '@/lib/i18n';
import { isConfigured, supabase } from '@/lib/supabase';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? '';
// Demo buttons only in builds made for showing Ardoise (EXPO_PUBLIC_DEMO=on).
const DEMO = process.env.EXPO_PUBLIC_DEMO === 'on' && WEB_URL.startsWith('http');

export default function LoginScreen() {
  const { session, gate, refreshGate, signOut } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null);
  const [demoBusy, setDemoBusy] = useState<'student' | 'teacher' | null>(null);
  const check = useRef<BotCheckHandle>(null);

  if (session && gate === 'ready') return <Redirect href="/" />;

  async function demo(role: 'student' | 'teacher') {
    setError(null);
    setDemoBusy(role);
    try {
      const captchaToken = await check.current?.take();
      const res = await fetch(`${WEB_URL}/api/demo-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, captchaToken }),
      });
      const tokens = (await res.json()) as { access_token?: string; refresh_token?: string; error?: string };
      if (tokens.error === 'captcha') {
        setError(t.captcha);
        return;
      }
      if (!res.ok || !tokens.access_token || !tokens.refresh_token) throw new Error('demo');
      const { error: e } = await supabase.auth.setSession({ access_token: tokens.access_token, refresh_token: tokens.refresh_token });
      if (e) throw e;
    } catch {
      setError(t.error);
    } finally {
      setDemoBusy(null);
    }
  }

  /** Email or matricule + password; a matricule is swapped for the account's email only when the password is right. */
  async function onSubmit() {
    setError(null);
    setNotice(null);
    setUnconfirmed(null);
    setBusy(true);
    try {
      const id = identifier.trim();
      let email = id;
      if (!id.includes('@')) {
        const { data, error: e } = await supabase.rpc('login_email', { p_matricule: id, p_password: password });
        if (e || !data) {
          setError(t.invalidLogin);
          return;
        }
        email = data as string;
      }
      const captchaToken = await check.current?.take();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });
      if (authError) {
        if (authError.code === 'captcha_failed') setError(t.captcha);
        else if (authError.code === 'email_not_confirmed') {
          setUnconfirmed(email);
          setError(t.unconfirmed);
        } else setError(t.invalidLogin);
      }
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!unconfirmed) return;
    setBusy(true);
    const captchaToken = await check.current?.take();
    const { error: e } = await supabase.auth.resend({
      type: 'signup',
      email: unconfirmed,
      options: { emailRedirectTo: WEB_URL ? `${WEB_URL}/auth/callback` : undefined, captchaToken },
    });
    setBusy(false);
    setError(null);
    if (e && (e.status === 429 || e.code === 'over_email_send_rate_limit')) setError(t.emailLimit);
    else if (e && e.code === 'captcha_failed') setError(t.captcha);
    else if (e) setError(t.error);
    else setNotice(t.resent);
  }

  /** Second step for accounts with two-step login on. */
  async function onCode() {
    setError(null);
    setBusy(true);
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const factor = factors?.totp.find((f) => f.status === 'verified');
      if (!factor) return;
      const { error: e } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.replace(/\s/g, '') });
      if (e) setError(t.wrongCode);
      else {
        setCode('');
        await refreshGate();
      }
    } finally {
      setBusy(false);
    }
  }

  const openWeb = (path = '') => (WEB_URL ? WebBrowser.openBrowserAsync(`${WEB_URL}${path}`) : undefined);

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
            {session && gate === null ? (
              <Loading />
            ) : session && gate === 'code' ? (
              <>
                <Text style={s.title}>{t.codeTitle}</Text>
                <Text style={s.body}>{t.codeIntro}</Text>
                <Input
                  label={t.code}
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  maxLength={7}
                  onSubmitEditing={onCode}
                />
                {error ? <Text style={s.error}>{error}</Text> : null}
                <Button title={t.verify} onPress={onCode} loading={busy} disabled={code.replace(/\s/g, '').length !== 6} />
                <Button title={t.otherAccount} variant="ghost" onPress={signOut} />
              </>
            ) : session && (gate === 'webOnly' || gate === 'setupOnWeb') ? (
              <>
                <Text style={s.title}>{gate === 'webOnly' ? t.webOnlyTitle : t.setupTitle}</Text>
                <Text style={s.body}>{gate === 'webOnly' ? t.webOnlyBody : t.setupBody}</Text>
                {WEB_URL ? <Button title={t.openWeb} onPress={() => openWeb(gate === 'setupOnWeb' ? '/security' : '')} /> : null}
                <Button title={t.otherAccount} variant="secondary" onPress={signOut} />
              </>
            ) : (
              <>
                <Input
                  label={t.identifier}
                  value={identifier}
                  onChangeText={setIdentifier}
                  autoCapitalize="none"
                  autoComplete="username"
                  textContentType="username"
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
                {WEB_URL ? (
                  <Pressable onPress={() => openWeb('/login/forgot')} hitSlop={8} style={{ alignSelf: 'flex-end' }}>
                    <Text style={s.link}>{t.forgot}</Text>
                  </Pressable>
                ) : null}
                <BotCheck ref={check} />
                {error ? <Text style={s.error}>{error}</Text> : null}
                {notice ? <Text style={s.notice}>{notice}</Text> : null}
                {unconfirmed ? <Button title={t.resend} variant="secondary" onPress={resend} disabled={busy} /> : null}
                <Button title={t.signIn} onPress={onSubmit} loading={busy} disabled={!identifier || !password || !isConfigured} />
                <View style={s.signupRow}>
                  <Text style={s.body}>{t.newStudent}</Text>
                  <Link href="/signup" asChild>
                    <Pressable hitSlop={8}>
                      <Text style={s.link}>{t.createAccount}</Text>
                    </Pressable>
                  </Link>
                </View>
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
              </>
            )}
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
  notice: { color: colors.leaf, fontSize: 15, fontFamily: fonts.bold },
  title: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.muted },
  link: { fontFamily: fonts.bold, fontSize: 15.5, color: colors.board, textDecorationLine: 'underline' },
  signupRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 },
  demo: { marginTop: 8, paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.border, gap: 10 },
  demoTitle: { fontFamily: fonts.bold, color: colors.muted, fontSize: 15, textAlign: 'center' },
});
