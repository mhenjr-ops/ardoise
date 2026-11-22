import { describe, expect, it } from "vitest";
import { outlineCounts, parseOutline, splitCode } from "./structure-outline";

describe("splitCode", () => {
  it("takes a short code in brackets at the end", () => {
    expect(splitCode("Faculty of Science (FS)")).toEqual({ name: "Faculty of Science", code: "FS" });
    expect(splitCode("Agriculture and Food Sciences (AFSH)")).toEqual({ name: "Agriculture and Food Sciences", code: "AFSH" });
  });
  it("keeps brackets that are part of the name", () => {
    expect(splitCode("Mathematics (with minor Computer Science)").code).toBeNull();
    expect(splitCode("Plant Sciences (Applied Botany)").name).toBe("Plant Sciences (Applied Botany)");
  });
});

describe("parseOutline", () => {
  it("reads faculties, schools, departments and programmes", () => {
    const units = parseOutline(`
# Faculty of Science (FS)
- Physics
- Mathematics and Computer Science
-- Pure Mathematics
-- Cybersecurity and Cryptology (CYB)
## Higher National Diploma (HND)
- HND programmes
-- Civil Engineering (CVEN) [hnd]
`);
    expect(units).toHaveLength(2);
    expect(units[0]).toMatchObject({ name: "Faculty of Science", code: "FS", kind: "faculty" });
    expect(units[0].departments.map((d) => d.name)).toEqual(["Physics", "Mathematics and Computer Science"]);
    expect(units[0].departments[1].programmes).toEqual([
      { name: "Pure Mathematics", code: null, cycle: "licence" },
      { name: "Cybersecurity and Cryptology", code: "CYB", cycle: "licence" },
    ]);
    expect(units[1]).toMatchObject({ kind: "school", code: "HND" });
    expect(units[1].departments[0].programmes[0]).toEqual({ name: "Civil Engineering", code: "CVEN", cycle: "hnd" });
    expect(outlineCounts(units)).toEqual({ units: 2, departments: 3, programmes: 3 });
  });

  it("understands WhatsApp lists", () => {
    const units = parseOutline("👉 *FLPS*\n✅ English private law\n✅ public law \n\n*Departments under each Faculty;*\n");
    expect(units).toEqual([
      {
        name: "FLPS",
        code: null,
        kind: "faculty",
        departments: [
          { name: "English private law", code: null, programmes: [] },
          { name: "public law", code: null, programmes: [] },
        ],
      },
    ]);
  });

  it("keeps departments listed before any faculty", () => {
    const units = parseOutline("- Library\n- Sports");
    expect(units).toHaveLength(1);
    expect(units[0].name).toBe("");
    expect(units[0].departments).toHaveLength(2);
  });
});
