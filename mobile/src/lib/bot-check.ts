/**
 * The phone app's bot check. Cloudflare Turnstile only runs in a web page, so the app opens
 * WEB_URL/app-check in a small web view and gets the token by message. A token works once:
 * take() hands out the current one and asks the page for a fresh one for the next try.
 */
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? '';
export const BOT_CHECK_ON = WEB_URL.startsWith('http');

export type BotCheckHandle = {
  /** The token for this attempt (waits briefly if the check is still running); undefined when the check is off or failed. */
  take: () => Promise<string | undefined>;
};

export type CheckMessage =
  | { source: 'ardoise-check'; type: 'token'; token: string }
  | { source: 'ardoise-check'; type: 'size'; height: number }
  | { source: 'ardoise-check'; type: 'expired' | 'error' | 'off' };

export function checkUrl(lang: string, theme: 'light' | 'dark' = 'light') {
  return `${WEB_URL.replace(/\/$/, '')}/app-check?lang=${lang === 'en' ? 'en' : 'fr'}&theme=${theme}`;
}

export function checkOrigin() {
  try {
    return new URL(WEB_URL).origin;
  } catch {
    return '';
  }
}

export function parseCheckMessage(raw: unknown): CheckMessage | null {
  let msg = raw;
  if (typeof raw === 'string') {
    try {
      msg = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!msg || typeof msg !== 'object' || (msg as { source?: unknown }).source !== 'ardoise-check') return null;
  return msg as CheckMessage;
}

const WAIT_MS = 25_000;

/** Keeps the latest token and the attempt waiting for one. The component sets how to ask the page for a new token. */
export function createTokenBox() {
  let reset = () => {};
  let token: string | null = null;
  let off = !BOT_CHECK_ON;
  let waiter: ((t: string | undefined) => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const settle = (t: string | undefined) => {
    if (timer) clearTimeout(timer);
    timer = null;
    const w = waiter;
    waiter = null;
    w?.(t);
  };

  return {
    setReset(fn: () => void) {
      reset = fn;
    },
    receive(msg: CheckMessage) {
      if (msg.type === 'off') {
        off = true;
        settle(undefined);
      } else if (msg.type === 'token') {
        if (waiter) {
          settle(msg.token);
          reset();
        } else token = msg.token;
      } else if (msg.type === 'expired') token = null;
      else if (msg.type === 'error') {
        token = null;
        settle(undefined);
      }
    },
    /** The page could not load at all (no network, site down). */
    fail() {
      token = null;
      settle(undefined);
    },
    take(): Promise<string | undefined> {
      if (off) return Promise.resolve(undefined);
      if (token) {
        const t = token;
        token = null;
        reset();
        return Promise.resolve(t);
      }
      settle(undefined); // only one attempt waits at a time
      return new Promise((resolve) => {
        waiter = resolve;
        timer = setTimeout(() => settle(undefined), WAIT_MS);
      });
    },
  };
}
