import { describe, expect, it } from "vitest";
import { detectColumns, parseCsv, rowsFromTable, splitCourses } from "./roster";

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
});
