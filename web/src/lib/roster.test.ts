import { describe, expect, it } from "vitest";
import { coursesFromTable, detectColumns, parseCsv, readWorkbook, rowsFromTable, splitCourses } from "./roster";

describe("student list import", () => {
  it("recognises French and English headers in any order", () => {
    const c = detectColumns(["N° Matricule", "Noms et Prénoms", "Filière", "Niveau", "Code UE", "E-mail", "Téléphone"]);
    expect(c).toEqual({ matricule: 0, name: 1, programme: 2, level: 3, courses: 4, email: 5, phone: 6 });
    expect(detectColumns(["Reg No", "Surname", "First Name", "Courses"])).toEqual({ matricule: 0, last: 1, first: 2, courses: 3 });
  });

  it("splits course codes however they're written", () => {
    expect(splitCourses("INF101, MAT102; ENG 110")).toEqual(["INF101", "MAT102", "ENG110"]);
    expect(splitCourses("INF101 MAT102")).toEqual(["INF101", "MAT102"]);
    expect(splitCourses("")).toEqual([]);
  });

  it("finds the header below a title and groups one row per registration", () => {
    const table = [
      ["UNIVERSITÉ DE BAMENDA — Liste des inscrits 2026/2027"],
      [],
      ["Matricule", "Nom", "Prénom", "Cours"],
      ["uba21e0001", "FON", "Brenda", "INF101"],
      ["UBA21E0001", "FON", "Brenda", "MAT102"],
      ["UBA21E0002", "NKOULOU", "Cédric", "INF101"],
      ["", "total", "", ""],
    ];
    const { rows, registrations, headerRow } = rowsFromTable(table);
    expect(headerRow).toBe(2);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ matricule: "UBA21E0001", full_name: "FON Brenda", courses: ["INF101", "MAT102"] });
    expect(registrations).toBe(3);
  });

  it("returns nothing without a matricule column", () => {
    expect(rowsFromTable([["Nom", "Cours"], ["X", "INF101"]]).rows).toEqual([]);
  });

  it("reads semicolon CSV from French Excel, with quotes", () => {
    const rows = parseCsv('﻿Matricule;Nom;Cours\r\nUBA1;"Fon; Brenda";"INF101, MAT102"\r\n');
    expect(rows).toEqual([
      ["Matricule", "Nom", "Cours"],
      ["UBA1", "Fon; Brenda", "INF101, MAT102"],
    ]);
  });

  it("reads course titles from a registration export (one row per student and course)", () => {
    const table = [
      ["Matricule", "Name", "Course Code", "Course Title", "Credits"],
      ["UBa25S0217", "NGWA Divine", "CSC 201", "Data Structures and Algorithms", 6],
      ["UBa25S0217", "NGWA Divine", "MAT 201", "Linear Algebra I", 5],
      ["UBa25S0218", "TANYI Grace", "CSC 201", "Data Structures and Algorithms", 6],
    ];
    const r = rowsFromTable(table);
    expect(r.rows.map((x) => x.courses)).toEqual([["CSC201", "MAT201"], ["CSC201"]]);
    expect(r.courses).toEqual([
      { code: "CSC201", title: "Data Structures and Algorithms" },
      { code: "MAT201", title: "Linear Algebra I" },
    ]);
  });
});


describe("courses sheets and whole workbooks", () => {
  it("reads a courses sheet with department, faculty and level", () => {
    const list = coursesFromTable([
      ["Course code", "Course title", "Department", "Faculty", "Level"],
      ["CEC 203", "Digital Electronics", "Computer Engineering", "NAHPI", "200"],
      ["", "no code", "", "", ""],
    ]);
    expect(list).toEqual([{ code: "CEC203", title: "Digital Electronics", department: "Computer Engineering", faculty: "NAHPI", level: "200" }]);
  });

  it("merges students across sheets and prefers the courses sheet's details", () => {
    const r = readWorkbook([
      { name: "Courses", data: [["Code", "Title", "Department"], ["CSC201", "Data Structures", "Mathematics and Computer Science"]] },
      { name: "Students", data: [["Matricule", "Name", "Course code", "Course title"], ["UBa1", "A B", "CSC201", "Data Structures and Algorithms"]] },
      { name: "More", data: [["Matricule", "Course code"], ["UBa1", "MAT201"]] },
    ]);
    expect(r.sheets).toEqual({ students: ["Students", "More"], courses: ["Courses"] });
    expect(r.rows).toEqual([expect.objectContaining({ matricule: "UBA1", courses: ["CSC201", "MAT201"] })]);
    expect(r.courses).toEqual([{ code: "CSC201", title: "Data Structures", department: "Mathematics and Computer Science" }]);
  });
});

describe("the downloadable Excel template", () => {
  it("is read back as courses and students", async () => {
    const { default: readXlsxFile } = await import("read-excel-file/node");
    const sheets = await readXlsxFile("public/templates/ardoise-student-list.xlsx");
    const r = readWorkbook(sheets.map((x) => ({ name: x.sheet, data: x.data as Parameters<typeof readWorkbook>[0][number]["data"] })));
    expect(r.sheets).toEqual({ students: ["Students"], courses: ["Courses"] });
    expect(r.rows.map((x) => [x.matricule, x.courses])).toEqual([
      ["UBA25S0217", ["CSC201", "MAT201"]],
      ["UBA25S0218", ["CSC201", "MAT201"]],
    ]);
    expect(r.courses.map((c) => [c.code, c.department])).toEqual([
      ["CSC201", "Mathematics and Computer Science"],
      ["MAT201", "Mathematics and Computer Science"],
      ["CEC203", "Computer Engineering"],
    ]);
  });
});
