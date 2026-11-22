"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";

const field = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max);
const code = (message: string) =>
  ["forbidden", "last_owner", "invalid_role", "invalid"].find((k) => message.includes(k)) ?? "generic";

export async function createInvitation(formData: FormData) {
  const role = field(formData, "role", 20);
  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("create_invitation", {
    p_institution: field(formData, "institution_id", 40),
    p_role: role,
    p_email: field(formData, "email", 320) || null,
    p_full_name: field(formData, "full_name", 200),
    p_faculty: role === "dean" ? field(formData, "faculty_id", 40) || null : null,
    p_department: role === "hod" || role === "teacher" ? field(formData, "department_id", 40) || null : null,
  });
  if (error) redirect(`/admin/people?error=${code(error.message)}`);
  revalidatePath("/admin/people");
  // The page shows the newest link this user created; the token never goes in the address bar.
  redirect("/admin/people?created=1");
}

export async function revokeInvitation(formData: FormData) {
  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("revoke_invitation", { p_invitation: field(formData, "id", 40) });
  if (error) redirect(`/admin/people?error=${code(error.message)}`);
  revalidatePath("/admin/people");
  redirect("/admin/people");
}

export async function revokeRole(formData: FormData) {
  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("revoke_role", { p_membership: field(formData, "id", 40) });
  if (error) redirect(`/admin/people?error=${code(error.message)}`);
  revalidatePath("/admin/people");
  redirect("/admin/people?ok=1");
}
