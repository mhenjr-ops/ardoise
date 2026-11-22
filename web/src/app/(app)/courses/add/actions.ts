"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";
import { errorCode } from "@/lib/errors";

const back = (fd: FormData, extra: string) => {
  const q = String(fd.get("q") ?? "").trim().slice(0, 80);
  return `/courses/add?${new URLSearchParams({ ...(q ? { q } : {}), ...Object.fromEntries(new URLSearchParams(extra)) })}`;
};

/** "I teach this course": the lecturer joins the course (shared if someone already teaches it). */
export async function teachCourse(formData: FormData) {
  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("teach_course", { p_course: String(formData.get("id") ?? "").slice(0, 40) });
  if (error) redirect(back(formData, `error=${errorCode(error)}`));
  revalidatePath("/dashboard");
  revalidatePath("/courses/add");
  redirect(back(formData, "added=1"));
}

export async function leaveCourse(formData: FormData) {
  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("leave_course", { p_course: String(formData.get("id") ?? "").slice(0, 40) });
  if (error) redirect(back(formData, `error=${errorCode(error)}`));
  revalidatePath("/dashboard");
  revalidatePath("/courses/add");
  redirect(back(formData, "left=1"));
}
