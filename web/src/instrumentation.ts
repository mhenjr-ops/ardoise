import type { Instrumentation } from "next";

/**
 * Server errors go to the Ardoise team's Alerts page (report_app_error in the database). The
 * report never holds up or breaks the page that failed: it gives up after three seconds.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NODE_ENV !== "production") return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;
  const message = err instanceof Error ? err.message : String(err);
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : "";
  try {
    await fetch(`${url}/rest/v1/rpc/report_app_error`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_path: request.path,
        p_message: message,
        p_digest: digest,
        p_where: context.routeType,
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Reporting is best effort.
  }
};
