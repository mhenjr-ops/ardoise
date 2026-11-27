import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { WEB_URL } from '@/lib/bot-check';
import { supabase } from '@/lib/supabase';

export type DraftError = 'not_registered' | 'offline' | 'failed';

/**
 * Downloads the student's draft transcript (stamped PROVISOIRE / DRAFT) from the website with
 * the app's session, then opens Android's share sheet so it can be viewed, saved or sent.
 */
export async function openDraftTranscript(locale: string, dialogTitle: string): Promise<DraftError | null> {
  if (!WEB_URL.startsWith('http')) return 'failed';
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return 'failed';
  let res: Response;
  try {
    res = await fetch(`${WEB_URL.replace(/\/$/, '')}/api/transcripts/draft?lang=${locale === 'en' ? 'en' : 'fr'}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return 'offline';
  }
  if (res.status === 404) return 'not_registered';
  if (!res.ok) return 'failed';
  const bytes = await res.arrayBuffer();
  const file = new File(Paths.cache, locale === 'en' ? 'draft-transcript.pdf' : 'releve-provisoire.pdf');
  if (file.exists) file.delete();
  file.create();
  await file.write(new Uint8Array(bytes));
  if (!(await Sharing.isAvailableAsync())) return 'failed';
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle });
  return null;
}
