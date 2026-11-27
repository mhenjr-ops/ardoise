import { createClient as createBearerClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { loadDraftTranscript } from "@/lib/draft-transcript";
import { supabaseKey, supabaseUrl } from "@/lib/env";
import { getI18n } from "@/lib/i18n/server";
import { messages, type Locale } from "@/lib/i18n/messages";
import { buildDraftTranscriptPdf } from "@/lib/pdf";
import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in student's draft transcript as a PDF. The website signs in with its cookie;
 * the phone app sends its session as "Authorization: Bearer <token>" (and ?lang=fr|en).
 */
export async function GET(request: NextRequest) {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const supabase = bearer
    ? createBearerClient(supabaseUrl(), supabaseKey(), {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : await createClient();
  const {
    data: { user },
  } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const lang = request.nextUrl.searchParams.get("lang");
  const { t, locale } = lang === "fr" || lang === "en" ? { t: messages[lang as Locale], locale: lang as Locale } : await getI18n();

  let draft;
  try {
    draft = await loadDraftTranscript(supabase, user.id);
  } catch (e) {
    const code = e instanceof Error && e.message.includes("mfa_required") ? "mfa_required" : "failed";
    return NextResponse.json({ error: code }, { status: code === "mfa_required" ? 403 : 500 });
  }
  if (!draft) return NextResponse.json({ error: "not_registered" }, { status: 404 });

  const pdf = await buildDraftTranscriptPdf({ t, locale, draft, generatedAt: new Date().toISOString() });
  const safeName = draft.student_name.normalize("NFD").replace(/[^A-Za-z0-9]+/g, "-");
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="releve-provisoire-${safeName}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
