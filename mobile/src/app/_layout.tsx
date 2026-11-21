import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { I18nProvider } from '@/lib/i18n';
import { colors } from '@/components/ui';

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootStack() {
  const { loading } = useAuth();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.board },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Ardoise' }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="course/[id]" options={{ title: '' }} />
        <Stack.Screen name="assignment/[id]" options={{ title: '' }} />
        <Stack.Screen name="page/[id]" options={{ title: '' }} />
        <Stack.Screen name="quiz/[id]" options={{ title: '', gestureEnabled: false }} />
        <Stack.Screen name="results" options={{ title: '' }} />
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
