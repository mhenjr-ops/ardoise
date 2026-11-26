"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";
import { errorCode } from "@/lib/errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX_BYTES = 1024 * 1024;

const field = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max);

/** Where the form came from: a console page or the university's own profile page, nothing else. */
function back(fd: FormData): string {
  const b = field(fd, "back", 80);
  return /^\/platform\/[a-z0-9-]{2,60}$/.test(b) || b === "/admin/profile" ? b : "/dashboard";
}
function target(fd: FormData) {
  const inst = field(fd, "institution_id", 40);
  if (!UUID.test(inst)) redirect(`${back(fd)}?error=invalid#look`);
  return inst;
}
function finish(fd: FormData, extra = "ok=1"): never {
  revalidatePath("/", "layout");
  redirect(`${back(fd)}?${extra}#look`);
}

export async function saveSchoolProfile(formData: FormData) {
  const inst = target(formData);
  let website = field(formData, "website", 300);
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  if (website) {
    try {
      new URL(website);
    } catch {
      redirect(`${back(formData)}?error=invalid#look`);
    }
  }
  const color = field(formData, "brand_color", 7).toLowerCase();
  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("set_school_profile", {
    p_institution: inst,
    p_short_name: field(formData, "short_name", 12),
    p_brand_color: /^#[0-9a-f]{6}$/.test(color) ? color : "",
    p_city: field(formData, "city", 80),
    p_website: website,
  });
  if (error) redirect(`${back(formData)}?error=${errorCode(error)}#look`);
  finish(formData);
}

export async function uploadSchoolLogo(formData: FormData) {
  const inst = target(formData);
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) redirect(`${back(formData)}?error=invalid#look`);
  const ext = TYPES[file.type];
  if (!ext) redirect(`${back(formData)}?error=logo_type#look`);
  if (file.size > MAX_BYTES) redirect(`${back(formData)}?error=logo_too_large#look`);

  const { supabase } = await actionSession();
  const { data: current } = await supabase.from("institutions").select("logo_path").eq("id", inst).maybeSingle();
  // A new name each time, so browsers and caches never show the old logo.
  const path = `${inst}/logo-${Date.now()}.${ext}`;
  const up = await supabase.storage.from("brand").upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) redirect(`${back(formData)}?error=forbidden#look`);
  const { error } = await supabase.rpc("set_school_logo", { p_institution: inst, p_path: path });
  if (error) {
    await supabase.storage.from("brand").remove([path]);
    redirect(`${back(formData)}?error=${errorCode(error)}#look`);
  }
  if (current?.logo_path) await supabase.storage.from("brand").remove([current.logo_path]);
  finish(formData);
}

export async function removeSchoolLogo(formData: FormData) {
  const inst = target(formData);
  const { supabase } = await actionSession();
  const { data: current } = await supabase.from("institutions").select("logo_path").eq("id", inst).maybeSingle();
  const { error } = await supabase.rpc("set_school_logo", { p_institution: inst, p_path: "" });
  if (error) redirect(`${back(formData)}?error=${errorCode(error)}#look`);
  if (current?.logo_path) await supabase.storage.from("brand").remove([current.logo_path]);
  finish(formData);
}
