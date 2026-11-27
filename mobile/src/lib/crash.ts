import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

/**
 * Crash reports. A JavaScript error that would close the app is sent to the Ardoise team's
 * Alerts page first (the same report_app_error the website uses), so a crash on someone's phone
 * shows up with its message instead of vanishing.
 */
const WHERE = `app-${Platform.OS}-${Constants.expoConfig?.version ?? ''}`.slice(0, 40);

export function reportError(error: unknown, path = 'app') {
  const e = error instanceof Error ? error : new Error(String(error));
  const firstFrame = (e.stack ?? '').split('\n').find((l) => l.trim() && !l.includes(e.message)) ?? '';
  return Promise.resolve(
    supabase.rpc('report_app_error', {
      p_path: path.slice(0, 200),
      p_message: `${e.name}: ${e.message} ${firstFrame.trim()}`.slice(0, 500),
      p_digest: '',
      p_where: WHERE,
    }),
  ).catch(() => {});
}

type Handler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsLike = { getGlobalHandler: () => Handler; setGlobalHandler: (h: Handler) => void };

let installed = false;
/** Fatal errors: report (waiting at most 1.5 s), then let React Native close the app as before. */
export function installCrashReporter() {
  const eu = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (installed || !eu || Platform.OS === 'web') return;
  installed = true;
  const previous = eu.getGlobalHandler();
  eu.setGlobalHandler((error, isFatal) => {
    if (!isFatal) {
      reportError(error, 'app:error');
      previous(error, isFatal);
      return;
    }
    const wait = new Promise((resolve) => setTimeout(resolve, 1500));
    Promise.race([reportError(error, 'app:crash'), wait]).finally(() => previous(error, isFatal));
  });
}
