import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

/**
 * What a signed-in account can do in the app:
 * - ready: students and lecturers
 * - code: two-step login is on and the code hasn't been entered in this session
 * - setupOnWeb: the account must turn two-step login on first (office roles, the Ardoise team)
 * - webOnly: the account runs a university or Ardoise itself, which happens on the website
 */
export type Gate = 'ready' | 'code' | 'setupOnWeb' | 'webOnly';

type Status = { aal?: string; has_mfa?: boolean; mfa_required?: boolean; platform?: boolean; roles?: string[] };

type AuthValue = {
  session: Session | null;
  loading: boolean;
  gate: Gate | null;
  refreshGate: () => Promise<void>;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthValue | null>(null);

async function readGate(): Promise<Gate> {
  const { data, error } = await supabase.rpc('account_status');
  if (error || !data) return 'ready'; // offline or older server: the database still decides what is shown
  const s = data as Status;
  if (s.has_mfa && s.aal !== 'aal2') return 'code';
  if (s.mfa_required && !s.has_mfa) return 'setupOnWeb';
  const roles = s.roles ?? [];
  if (s.platform || (roles.length > 0 && !roles.includes('student') && !roles.includes('teacher'))) return 'webOnly';
  return 'ready';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [gate, setGate] = useState<Gate | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Recomputed whenever the account or its token changes (sign-in, code entered, refresh). A new
  // account starts from "unknown"; a refreshed token keeps the current answer until the new one is in.
  const lastUser = useRef<string | null>(null);
  useEffect(() => {
    let live = true;
    const userId = session?.user.id ?? null;
    if (userId !== lastUser.current) {
      lastUser.current = userId;
      setGate(null);
    }
    if (!session) return;
    readGate().then((g) => {
      if (live) setGate(g);
    });
    return () => {
      live = false;
    };
  }, [session?.user.id, session?.access_token]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshGate = useCallback(async () => {
    setGate(await readGate());
  }, []);

  const value = useMemo(
    () => ({
      session,
      loading,
      gate,
      refreshGate,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, loading, gate, refreshGate],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
