import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { buildTranscriptPdf, type TranscriptPayload } from "@/lib/pdf";

/** The student's own transcript, or any transcript of the school for the registrar (RLS decides). */
export async function GET(request: NextRequest, { params }: RouteContext<"/results/transcripts/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { data } = await supabase
    .from("transcripts")
    .select("id, verification_code, payload, issued_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) return new NextResponse("Not found", { status: 404 });

  const { t, locale } = await getI18n();
  const origin = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  const payload = data.payload as TranscriptPayload;
  const pdf = await buildTranscriptPdf({
    t,
    locale,
    payload,
    code: data.verification_code,
    verifyUrl: `${origin}/verify/${data.verification_code}`,
    issuedAt: data.issued_at,
  });
  const safeName = payload.student_name.normalize("NFD").replace(/[^A-Za-z0-9]+/g, "-");
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="releve-${safeName}-${payload.semester}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
