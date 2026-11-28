import { createClient as createBearerClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseKey, supabaseUrl } from "@/lib/env";
import { errorCode } from "@/lib/errors";
import { readFormB } from "@/lib/form-b";
import { createClient } from "@/lib/supabase/server";

/**
 * A student's Form B: "check" reads it and says what it would register; "apply" registers it.
 * The website signs in with its cookie; the phone app sends "Authorization: Bearer <token>".
 */
export async function POST(request: NextRequest) {
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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "not_pdf" }, { status: 400 });
  }
  const file = form.get("file");
  const mode = form.get("mode") === "apply" ? "apply" : "check";
  if (!(file instanceof Blob)) return NextResponse.json({ error: "not_pdf" }, { status: 400 });
  const read = await readFormB(new Uint8Array(await file.arrayBuffer()));
  if ("error" in read) return NextResponse.json({ error: read.error }, { status: 400 });

  const { data, error } = await supabase.rpc(mode === "apply" ? "form_b_apply" : "form_b_check", {
    p_sha256: read.sha256,
    p_text: read.text,
  });
  if (error) {
    const known = ["form_b_not_yours", "form_b_wrong_year", "form_b_no_courses", "form_b_used", "no_matricule"].find((k) =>
      (error.message ?? "").includes(k),
    );
    return NextResponse.json({ error: known ?? errorCode(error) }, { status: 400 });
  }
  return NextResponse.json({ mode, result: data }, { headers: { "Cache-Control": "no-store" } });
}
