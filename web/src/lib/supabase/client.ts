"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseKey, supabaseUrl } from "@/lib/env";

/** Supabase client for Client Components (used for direct file uploads). */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseKey());
}
