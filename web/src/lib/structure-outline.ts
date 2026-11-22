/**
 * Turns a pasted list into a school structure for the Ardoise console.
 *
 *   # Faculty of Science (FS)          a faculty
 *   ## College of Technology (COLTECH) a school, college or institute
 *   - Physics                          a department of the faculty or school above
 *   -- Pure Mathematics                a programme of the department above
 *   -- Civil Engineering (CVEN) [hnd]  [licence] [master] [doctorat] [hnd] [other]; default licence
 *
 * WhatsApp-style lists work too: 👉 starts a faculty, ✅ a department, and *bold* marks
 * are ignored. A short code in brackets at the end, like (FS), becomes the code.
 */

export type Cycle = "licence" | "master" | "doctorat" | "hnd" | "other";
export type OutlineProgramme = { name: string; code: string | null; cycle: Cycle };
export type OutlineDepartment = { name: string; code: string | null; programmes: OutlineProgramme[] };
export type OutlineUnit = { name: string; code: string | null; kind: "faculty" | "school"; departments: OutlineDepartment[] };

const CYCLES: Cycle[] = ["licence", "master", "doctorat", "hnd", "other"];

/** "Faculty of Science (FS)" -> name + code. Brackets with spaces stay in the name. */
export function splitCode(text: string): { name: string; code: string | null } {
  const m = text.match(/^(.*?)\s*\(([A-Za-z0-9][A-Za-z0-9&./-]{0,11})\)\s*$/);
  if (m && m[1].trim()) return { name: m[1].trim(), code: m[2] };
  return { name: text.trim(), code: null };
}

function clean(text: string) {
  return text
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/, "")
    .trim();
}

export function parseOutline(input: string): OutlineUnit[] {
  const units: OutlineUnit[] = [];
  let unit: OutlineUnit | null = null;
  let dept: OutlineDepartment | null = null;
  const orphan = (): OutlineUnit => {
    if (!unit) {
      unit = { name: "", code: null, kind: "faculty", departments: [] };
      units.push(unit);
    }
    return unit;
  };

  for (const raw of input.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;
    let level: "school" | "faculty" | "department" | "programme" | null = null;
    if (line.startsWith("##")) level = "school";
    else if (line.startsWith("#") || line.startsWith("👉")) level = "faculty";
    else if (line.startsWith("--")) level = "programme";
    else if (line.startsWith("-") || line.startsWith("✅") || line.startsWith("•")) level = "department";
    if (!level) continue;
    line = clean(line.replace(/^(##|#|👉|--|-|✅|•)\s*/u, ""));
    if (!line) continue;

    if (level === "faculty" || level === "school") {
      const { name, code } = splitCode(line);
      unit = { name, code, kind: level, departments: [] };
      units.push(unit);
      dept = null;
    } else if (level === "department") {
      const { name, code } = splitCode(line);
      dept = { name, code, programmes: [] };
      orphan().departments.push(dept);
    } else {
      const cycleMatch = line.match(/\s*\[([a-z]+)\]\s*$/i);
      const cycle = (CYCLES.find((c) => c === cycleMatch?.[1]?.toLowerCase()) ?? "licence") as Cycle;
      const { name, code } = splitCode(cycleMatch ? line.slice(0, cycleMatch.index) : line);
      if (!dept) {
        dept = { name: "", code: null, programmes: [] };
        orphan().departments.push(dept);
      }
      dept.programmes.push({ name, code, cycle });
    }
  }
  // Drop placeholders that never got a name (programmes without a department, etc.).
  return units
    .map((u) => ({ ...u, departments: u.departments.filter((d) => d.name) }))
    .filter((u) => u.name || u.departments.length);
}

export function outlineCounts(units: OutlineUnit[]) {
  return {
    units: units.filter((u) => u.name).length,
    departments: units.reduce((n, u) => n + u.departments.length, 0),
    programmes: units.reduce((n, u) => n + u.departments.reduce((m, d) => m + d.programmes.length, 0), 0),
  };
}
