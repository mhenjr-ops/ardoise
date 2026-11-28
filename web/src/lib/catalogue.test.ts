import { describe, expect, it } from "vitest";
import { catalogueFromTable, catalogueFromWorkbook, creditsOf, semesterOf } from "./catalogue";
import { parseCsv } from "./roster";

describe("course catalogue files", () => {
  it("reads the semester however it is written", () => {
    expect(semesterOf("First Semester")).toBe("1");
    expect(semesterOf("Semestre 2")).toBe("2");
    expect(semesterOf("S1")).toBe("1");
    expect(semesterOf("2nd")).toBe("2");
    expect(semesterOf(2)).toBe("2");
    expect(semesterOf("Annual")).toBe("");
  });

  it("keeps credits only when they are a number", () => {
    expect(creditsOf("3")).toBe("3");
    expect(creditsOf("2,5")).toBe("2.5");
    expect(creditsOf(6)).toBe("6");
    expect(creditsOf("three")).toBe("");
  });

  it("reads the Ardoise export with one row per course and department", () => {
    const table = parseCsv(
      "Code,Title,Year,Semester,Credits,School,Department\n" +
        "CVLE2101,Strength of Materials I,1,1,3,NAHPI,Civil Engineering and Architecture\n" +
        "MATE2101,Engineering Mathematics I,1,1,,NAHPI,Civil Engineering and Architecture; Mechanical and Industrial Engineering\n" +
        ",No code,1,1,,,\n" +
        "X1,,1,1,,,\n",
    );
    const { rows, columns } = catalogueFromTable(table);
    expect(columns.department).toBe(6);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      code: "CVLE2101",
      title: "Strength of Materials I",
      level: "1",
      semester: "1",
      credits: "3",
      school: "NAHPI",
      department: "Civil Engineering and Architecture",
    });
    expect(rows.slice(1).map((r) => r.department)).toEqual(["Civil Engineering and Architecture", "Mechanical and Industrial Engineering"]);
  });

  it("finds a French header row below a title and counts courses and departments", () => {
    const sheet = [
      ["Université — liste des UE"],
      [],
      ["Code UE", "Intitulé de l'UE", "Niveau", "Semestre", "Crédits", "Faculté", "Département"],
      ["inf 111", "Algorithmique", "L1", "Premier semestre", 6, "FS", "Informatique"],
      ["INF112", "Architecture", "L1", "Second semestre", "4", "FS", "Informatique"],
    ];
    const book = catalogueFromWorkbook([{ name: "UE", data: sheet }, { name: "Notes", data: [["anything"]] }]);
    expect(book.rows.map((r) => [r.code, r.level, r.semester, r.credits])).toEqual([
      ["INF111", "L1", "1", "6"],
      ["INF112", "L1", "2", "4"],
    ]);
    expect(book.courses).toBe(2);
    expect(book.departments).toBe(1);
  });

  it("finds nothing in a file without a code and a title", () => {
    expect(catalogueFromTable([["Name", "Email"], ["A", "a@b.c"]]).rows).toEqual([]);
  });
});
