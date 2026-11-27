/** The app's web preview has no push notifications; these keep the same shape as push.ts. */
export async function ensureChannel(_name: string) {}
export async function pushPermission(): Promise<string> {
  return 'unsupported';
}
export async function registerForPush(_locale: string, _channelName: string, _ask = true) {}
export async function unregisterPush() {}
export function usePush(_: { active: boolean; locale: string; channelName: string }) {}
