import { Alegreya_600SemiBold } from '@expo-google-fonts/alegreya/600SemiBold';
import { Alegreya_700Bold } from '@expo-google-fonts/alegreya/700Bold';
import { AlegreyaSans_400Regular } from '@expo-google-fonts/alegreya-sans/400Regular';
import { AlegreyaSans_500Medium } from '@expo-google-fonts/alegreya-sans/500Medium';
import { AlegreyaSans_700Bold } from '@expo-google-fonts/alegreya-sans/700Bold';
import { AlegreyaSans_800ExtraBold } from '@expo-google-fonts/alegreya-sans/800ExtraBold';
import { useFonts } from 'expo-font';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { AuthProvider, useAuth } from '@/lib/auth';
import { installCrashReporter, reportError } from '@/lib/crash';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { usePush } from '@/lib/push';
import { colors, fonts } from '@/components/ui';

SplashScreen.preventAutoHideAsync().catch(() => {});
installCrashReporter();

/**
 * A screen that fails to draw shows this instead of closing the app, and the error is reported
 * to the Ardoise team. Plain text only: fonts or translations may be what failed.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    reportError(error, 'app:screen');
  }, [error]);
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 28, gap: 14, backgroundColor: '#F4EDE1' }}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: '#1F3B36' }}>Oups… / Something went wrong</Text>
      <Text style={{ fontSize: 15, color: '#5C5346' }}>
        L’équipe Ardoise a été prévenue. / The Ardoise team has been told.
      </Text>
      <View style={{ padding: 12, borderRadius: 10, backgroundColor: '#EFE4D2' }}>
        <Text selectable style={{ fontSize: 13, color: '#5C5346' }}>
          {error.name}: {error.message}
        </Text>
      </View>
      <Pressable onPress={retry} style={{ alignSelf: 'flex-start', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, backgroundColor: '#1F3B36' }}>
        <Text style={{ color: '#F8F3EA', fontWeight: '700', fontSize: 16 }}>Réessayer / Try again</Text>
      </Pressable>
    </ScrollView>
  );
}

/** Registers the phone for pushes and opens the screen a tapped push points to (needs the stack mounted). */
function PushBridge() {
  const { session, gate } = useAuth();
  const { t, locale } = useI18n();
  usePush({ active: !!session && gate === 'ready', locale, channelName: t.pushChannel });
  return null;
}

function RootStack() {
  const { loading } = useAuth();
  const [fontsLoaded, fontError] = useFonts({
    Alegreya_600SemiBold,
    Alegreya_700Bold,
    AlegreyaSans_400Regular,
    AlegreyaSans_500Medium,
    AlegreyaSans_700Bold,
    AlegreyaSans_800ExtraBold,
  });
  const ready = !loading && (fontsLoaded || !!fontError);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <>
      <StatusBar style="light" />
      <PushBridge />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.board },
          headerTintColor: colors.chalk,
          headerTitleStyle: { fontFamily: fonts.display, fontSize: 19 },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ headerShown: false }} />
        <Stack.Screen name="course/[id]" options={{ title: '' }} />
        <Stack.Screen name="assignment/[id]" options={{ title: '' }} />
        <Stack.Screen name="page/[id]" options={{ title: '' }} />
        <Stack.Screen name="quiz/[id]" options={{ title: '', gestureEnabled: false }} />
        <Stack.Screen name="inbox/new" options={{ title: '' }} />
        <Stack.Screen name="inbox/[id]" options={{ title: '' }} />
        <Stack.Screen name="discussion/[id]" options={{ title: '' }} />
        <Stack.Screen name="notifications" options={{ title: '' }} />
        <Stack.Screen name="notification-settings" options={{ title: '' }} />
        <Stack.Screen name="grade/[id]" options={{ title: '' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <I18nProvider>
      <AuthProvider>
        <RootStack />
      </AuthProvider>
    </I18nProvider>
  );
}
