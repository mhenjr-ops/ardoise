"use client";

import { useState } from "react";
import type { InstitutionRole } from "@/lib/types";

type Option = { id: string; name: string };

/** Invitation form: the scope fields follow the chosen role. */
export function InviteForm({
  action,
  institutionId,
  roles,
  faculties,
  departments,
  teacherDepartmentRequired,
  labels,
}: {
  action: (formData: FormData) => void | Promise<void>;
  institutionId: string;
  roles: Array<{ value: InstitutionRole; label: string; help: string }>;
  faculties: Option[];
  departments: Option[];
  /** Deans and heads of department invite teachers into one of their departments. */
  teacherDepartmentRequired: boolean;
  labels: {
    role: string;
    faculty: string;
    department: string;
    departmentOptional: string;
    email: string;
    emailHelp: string;
    name: string;
    submit: string;
    noStructure: string;
  };
}) {
  const [role, setRole] = useState<InstitutionRole>(roles[roles.length - 1]?.value ?? "teacher");
  const needsFaculty = role === "dean";
  const needsDepartment = role === "hod";
  const showDepartment = role === "hod" || role === "teacher";
  const departmentRequired = needsDepartment || (role === "teacher" && teacherDepartmentRequired);
  const missing = (needsFaculty && faculties.length === 0) || (showDepartment && departmentRequired && departments.length === 0);
  const help = roles.find((r) => r.value === role)?.help;
  const field = "block w-full rounded-[10px] border border-slate-300 bg-paper px-3 py-2.5 text-[15px] focus:border-ardoise";

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="institution_id" value={institutionId} />
      <label className="block space-y-1.5 sm:col-span-2">
        <span className="text-[14px] font-semibold text-slate-700">{labels.role}</span>
        <select name="role" value={role} onChange={(e) => setRole(e.target.value as InstitutionRole)} className={field}>
          {roles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        {help ? <span className="block text-[13px] text-slate-500">{help}</span> : null}
      </label>
      {needsFaculty ? (
        <label className="block space-y-1.5 sm:col-span-2">
          <span className="text-[14px] font-semibold text-slate-700">{labels.faculty}</span>
          <select name="faculty_id" required className={field}>
            {faculties.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {showDepartment ? (
        <label className="block space-y-1.5 sm:col-span-2">
          <span className="text-[14px] font-semibold text-slate-700">{departmentRequired ? labels.department : labels.departmentOptional}</span>
          <select name="department_id" required={departmentRequired} className={field} defaultValue={departmentRequired ? departments[0]?.id : ""}>
            {departmentRequired ? null : <option value="">—</option>}
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="block space-y-1.5">
        <span className="text-[14px] font-semibold text-slate-700">{labels.name}</span>
        <input name="full_name" maxLength={200} className={field} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-[14px] font-semibold text-slate-700">{labels.email}</span>
        <input name="email" type="email" maxLength={320} className={field} />
        <span className="block text-[13px] text-slate-500">{labels.emailHelp}</span>
      </label>
      <div className="sm:col-span-2">
        {missing ? (
          <p className="text-[14px] text-terracotta-600">{labels.noStructure}</p>
        ) : (
          <button type="submit" className="inline-flex h-11 items-center rounded-[10px] bg-ardoise px-5 text-[15px] font-semibold text-chalk hover:bg-brand-600">
            {labels.submit}
          </button>
        )}
      </div>
    </form>
  );
}
