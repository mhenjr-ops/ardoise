import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { routeForLink } from '@/lib/inbox';
import { supabase } from '@/lib/supabase';

/**
 * Push notifications. After sign-in the phone asks once for permission, gets its Expo push
 * token and registers it (with the app's language, so pushes arrive in French or English).
 * The database sends the pushes itself whenever a notification is created.
 */
const TOKEN_KEY = 'ardoise.pushToken';

// While the app is open, still show the banner (the in-app bell updates too).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

export async function ensureChannel(name: string) {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name,
    importance: AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1F3B36',
  });
}

/** 'granted' | 'denied' | 'undetermined' — 'unsupported' on a simulator or a build without push. */
export async function pushPermission(): Promise<string> {
  if (!Device.isDevice || !projectId()) return 'unsupported';
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

/** Registers this phone for the signed-in account. Quiet when push isn't possible or allowed. */
export async function registerForPush(locale: string, channelName: string, ask = true) {
  try {
    const id = projectId();
    if (!Device.isDevice || !id) return;
    await ensureChannel(channelName);
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && ask) status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
    const { error } = await supabase.rpc('register_push_device', {
      p_token: token,
      p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
      p_locale: locale === 'en' ? 'en' : 'fr',
    });
    if (!error) await AsyncStorage.setItem(TOKEN_KEY, token);
  } catch {
    // No network or no Google services: the in-app notifications still work.
  }
}

/** Call before signing out, while the session can still prove whose phone this is. */
export async function unregisterPush() {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;
    await supabase.rpc('unregister_push_device', { p_token: token });
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // Signing out still goes ahead; the server forgets stale phones on its own.
  }
}

/** Registers when signed in, and opens the right screen when a push is tapped. */
export function usePush({ active, locale, channelName }: { active: boolean; locale: string; channelName: string }) {
  useEffect(() => {
    if (active) registerForPush(locale, channelName);
  }, [active, locale, channelName]);

  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!active || !response) return;
    const key = response.notification.request.identifier;
    if (handled.current === key) return;
    handled.current = key;
    const data = (response.notification.request.content.data ?? {}) as { link?: string | null; id?: number };
    if (typeof data.id === 'number') {
      supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', data.id).is('read_at', null).then(() => {});
    }
    const target = routeForLink(typeof data.link === 'string' ? data.link : null);
    router.push(target ?? '/notifications');
  }, [active, response]);
}
