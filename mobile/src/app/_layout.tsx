import { Alegreya_600SemiBold } from '@expo-google-fonts/alegreya/600SemiBold';
import { Alegreya_700Bold } from '@expo-google-fonts/alegreya/700Bold';
import { AlegreyaSans_400Regular } from '@expo-google-fonts/alegreya-sans/400Regular';
import { AlegreyaSans_500Medium } from '@expo-google-fonts/alegreya-sans/500Medium';
import { AlegreyaSans_700Bold } from '@expo-google-fonts/alegreya-sans/700Bold';
import { AlegreyaSans_800ExtraBold } from '@expo-google-fonts/alegreya-sans/800ExtraBold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { I18nProvider } from '@/lib/i18n';
import { colors, fonts } from '@/components/ui';

SplashScreen.preventAutoHideAsync().catch(() => {});

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
        <Stack.Screen name="course/[id]" options={{ title: '' }} />
        <Stack.Screen name="assignment/[id]" options={{ title: '' }} />
        <Stack.Screen name="page/[id]" options={{ title: '' }} />
        <Stack.Screen name="quiz/[id]" options={{ title: '', gestureEnabled: false }} />
        <Stack.Screen name="inbox/new" options={{ title: '' }} />
        <Stack.Screen name="inbox/[id]" options={{ title: '' }} />
        <Stack.Screen name="discussion/[id]" options={{ title: '' }} />
        <Stack.Screen name="notifications" options={{ title: '' }} />
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
