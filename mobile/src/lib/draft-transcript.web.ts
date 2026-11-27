import { WEB_URL } from '@/lib/bot-check';
import { supabase } from '@/lib/supabase';

export type DraftError = 'not_registered' | 'offline' | 'failed';

/** Browser preview: fetch the PDF with the session and open it in a new tab. */
export async function openDraftTranscript(locale: string, _dialogTitle: string): Promise<DraftError | null> {
  if (!WEB_URL.startsWith('http')) return 'failed';
  const tab = window.open('', '_blank');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    tab?.close();
    return 'failed';
  }
  let res: Response;
  try {
    res = await fetch(`${WEB_URL.replace(/\/$/, '')}/api/transcripts/draft?lang=${locale === 'en' ? 'en' : 'fr'}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    tab?.close();
    return 'offline';
  }
  if (!res.ok) {
    tab?.close();
    return res.status === 404 ? 'not_registered' : 'failed';
  }
  const url = URL.createObjectURL(await res.blob());
  if (tab) tab.location.href = url;
  else window.location.href = url;
  return null;
}
