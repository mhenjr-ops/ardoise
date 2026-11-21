import { describe, expect, it } from "vitest";
import {
  DEFAULT_POLICY,
  computeStudent,
  courseMark,
  type DeliberationInput,
  type EngineAssignment,
  type EngineCourse,
  type Policy,
} from "./lmd";

const course = (id: string, ue: string | null, coefficient = 1, weights: Record<string, number> | null = null): EngineCourse => ({
  id,
  code: id.toUpperCase(),
  title: id,
  teaching_unit_id: ue,
  coefficient,
  component_weights: weights,
});

let n = 0;
const asg = (courseId: string, component: EngineAssignment["component"], points = 20, weight = 1): EngineAssignment => ({
  id: `a${++n}`,
  course_id: courseId,
  component,
  points_possible: points,
  weight,
});

const grades = (entries: Array<[EngineAssignment, number | null]>) => new Map(entries.map(([a, s]) => [a.id, s]));

describe("courseMark", () => {
  it("mixes CC 30 / TP 20 / exam 50 by default", () => {
    const c = course("inf", null);
    const cc = asg("inf", "cc");
    const tp = asg("inf", "tp");
    const ex = asg("inf", "exam");
    const r = courseMark(c, [cc, tp, ex], grades([[cc, 12], [tp, 15], [ex, 10]]), DEFAULT_POLICY);
    expect(r.mark).toBe(11.6);
    expect(r.components).toEqual({ cc: 12, tp: 15, exam: 10 });
  });

  it("renormalises when a course has no TP", () => {
    const c = course("mat", null);
    const cc = asg("mat", "cc");
    const ex = asg("mat", "exam");
    expect(courseMark(c, [cc, ex], grades([[cc, 12], [ex, 10]]), DEFAULT_POLICY).mark).toBe(10.75);
  });

  it("scales marks given on other scales to /20", () => {
    const c = course("phy", null);
    const tp = asg("phy", "tp", 10);
    expect(courseMark(c, [tp], grades([[tp, 8]]), DEFAULT_POLICY).mark).toBe(16);
  });

  it("counts a missing mark as 0 inside a component", () => {
    const c = course("chi", null);
    const cc1 = asg("chi", "cc");
    const cc2 = asg("chi", "cc");
    expect(courseMark(c, [cc1, cc2], grades([[cc1, 14]]), DEFAULT_POLICY).mark).toBe(7);
  });

  it("uses assignment weights inside a component", () => {
    const c = course("bio", null);
    const cc1 = asg("bio", "cc", 20, 1);
    const cc2 = asg("bio", "cc", 20, 3);
    expect(courseMark(c, [cc1, cc2], grades([[cc1, 8], [cc2, 16]]), DEFAULT_POLICY).mark).toBe(14);
  });

  it("is null (absent) when the student has no mark at all", () => {
    const c = course("eco", null);
    const ex = asg("eco", "exam");
    expect(courseMark(c, [ex], grades([]), DEFAULT_POLICY).mark).toBeNull();
  });

  it("replaces the exam with the resit by default", () => {
    const c = course("his", null);
    const ex = asg("his", "exam");
    const rs = asg("his", "resit");
    expect(courseMark(c, [ex, rs], grades([[ex, 6], [rs, 12]]), DEFAULT_POLICY).mark).toBe(12);
  });

  it("keeps the better of exam and resit under the 'max' rule", () => {
    const c = course("geo", null);
    const ex = asg("geo", "exam");
    const rs = asg("geo", "resit");
    const policy: Policy = { ...DEFAULT_POLICY, resit_rule: "max" };
    expect(courseMark(c, [ex, rs], grades([[ex, 14], [rs, 12]]), policy).mark).toBe(14);
  });

  it("honours per-course component weights", () => {
    const c = course("eng", null, 1, { cc: 50, tp: 0, exam: 50 });
    const cc = asg("eng", "cc");
    const ex = asg("eng", "exam");
    expect(courseMark(c, [cc, ex], grades([[cc, 16], [ex, 10]]), DEFAULT_POLICY).mark).toBe(13);
  });
});

function input(overrides: Partial<DeliberationInput> = {}): DeliberationInput {
  return {
    policy: DEFAULT_POLICY,
    ues: [],
    courses: [],
    assignments: [],
    grades: [],
    students: ["s1"],
    bonuses: [],
    ...overrides,
  };
}

/** Two UEs (6 and 4 credits), one course each, one exam each. */
function twoUEs(mark1: number | null, mark2: number | null, policy: Policy = DEFAULT_POLICY) {
  const e1 = asg("c1", "exam");
  const e2 = asg("c2", "exam");
  const g = [
    ...(mark1 === null ? [] : [{ assignment_id: e1.id, student_id: "s1", score: mark1 }]),
    ...(mark2 === null ? [] : [{ assignment_id: e2.id, student_id: "s1", score: mark2 }]),
  ];
  return input({
    policy,
    ues: [
      { id: "ue1", code: "UE1", title: "Programmation", credits: 6 },
      { id: "ue2", code: "UE2", title: "Mathématiques", credits: 4 },
    ],
    courses: [course("c1", "ue1"), course("c2", "ue2")],
    assignments: [e1, e2],
    grades: g,
  });
}

describe("computeStudent", () => {
  it("weights courses by coefficient inside a UE", () => {
    const a = asg("ca", "exam");
    const b = asg("cb", "exam");
    const r = computeStudent(
      input({
        ues: [{ id: "ue", code: "UE", title: "UE", credits: 5 }],
        courses: [course("ca", "ue", 2), course("cb", "ue", 1)],
        assignments: [a, b],
        grades: [
          { assignment_id: a.id, student_id: "s1", score: 12 },
          { assignment_id: b.id, student_id: "s1", score: 9 },
        ],
      }),
      "s1",
    );
    expect(r.ue_results[0].mark).toBe(11);
    expect(r.decision).toBe("admitted");
  });

  it("admits when every UE is validated", () => {
    const r = computeStudent(twoUEs(13, 11), "s1");
    expect(r.semester_average).toBe(12.2);
    expect(r.credits_earned).toBe(10);
    expect(r.decision).toBe("admitted");
  });

  it("compensates a failed UE when the semester average passes", () => {
    const r = computeStudent(twoUEs(13, 8.5), "s1");
    expect(r.semester_average).toBe(11.2);
    expect(r.ue_results[1].status).toBe("compensated");
    expect(r.credits_earned).toBe(10);
    expect(r.decision).toBe("admitted_compensation");
  });

  it("does not compensate below the elimination mark", () => {
    const r = computeStudent(twoUEs(13, 8.5, { ...DEFAULT_POLICY, elimination_mark: 9 }), "s1");
    expect(r.ue_results[1].status).toBe("failed");
    expect(r.credits_earned).toBe(6);
    expect(r.decision).toBe("resit");
  });

  it("does not compensate when the policy turns it off", () => {
    const r = computeStudent(twoUEs(13, 8.5, { ...DEFAULT_POLICY, ue_compensation: false }), "s1");
    expect(r.decision).toBe("resit");
  });

  it("sends to resit when the average fails", () => {
    const r = computeStudent(twoUEs(9, 8), "s1");
    expect(r.semester_average).toBe(8.6);
    expect(r.credits_earned).toBe(0);
    expect(r.decision).toBe("resit");
  });

  it("applies a jury bonus, capped by the policy", () => {
    const base = twoUEs(9.6, 12, { ...DEFAULT_POLICY, ue_compensation: false });
    const withBonus = { ...base, bonuses: [{ student_id: "s1", teaching_unit_id: "ue1", bonus: 0.5 }] };
    const r = computeStudent(withBonus, "s1");
    expect(r.ue_results[0].final).toBe(10.1);
    expect(r.ue_results[0].status).toBe("validated");
    expect(r.decision).toBe("admitted");

    const capped = { ...base, bonuses: [{ student_id: "s1", teaching_unit_id: "ue1", bonus: 3 }] };
    expect(computeStudent(capped, "s1").ue_results[0].final).toBe(10.6);
  });

  it("marks the student incomplete when a UE has no mark", () => {
    const r = computeStudent(twoUEs(14, null), "s1");
    expect(r.ue_results[1].status).toBe("incomplete");
    expect(r.semester_average).toBeNull();
    expect(r.decision).toBe("incomplete");
  });

  it("never lets a bonus push a mark above 20", () => {
    const base = twoUEs(19.8, 12);
    const r = computeStudent({ ...base, bonuses: [{ student_id: "s1", teaching_unit_id: "ue1", bonus: 1 }] }, "s1");
    expect(r.ue_results[0].final).toBe(20);
  });
});

describe("demo seed semester", () => {
  it("gives 3 passed, 1 passed by compensation, 1 resit", () => {
    const students = ["brenda", "cedric", "mireille", "yannick", "ines"];
    const row = (...v: number[]) => Object.fromEntries(students.map((s, i) => [s, v[i]]));
    const defs: Array<[string, string, EngineAssignment["component"], number, number, Record<string, number> | null]> = [
      ["inf", "cc1", "cc", 20, 1.5, row(14.5, 11, 16, 8.5, 12.75)],
      ["inf", "quiz", "cc", 20, 0, null],
      ["inf", "tp1", "tp", 20, 1, row(15, 12, 17, 9, 13)],
      ["inf", "tp2", "tp", 10, 1, row(8, 6, 9, 4, 7)],
      ["inf", "exi", "exam", 20, 1, row(13, 10.5, 15.5, 7, 11)],
      ["mat", "td1", "cc", 20, 1, row(12, 8, 14, 6, 10)],
      ["mat", "exm", "exam", 20, 1, row(11.5, 8, 13, 5.5, 10.5)],
      ["eng", "wt1", "cc", 20, 1, row(16, 13, 15, 11, 14)],
      ["eng", "exe", "exam", 20, 1, row(14, 12, 14.5, 10, 12.5)],
    ];
    const assignments = defs.map(([course_id, id, component, points_possible, weight]) => ({ id, course_id, component, points_possible, weight }));
    const grades = defs.flatMap(([, id, , , , marks]) =>
      marks ? Object.entries(marks).map(([student_id, score]) => ({ assignment_id: id, student_id, score })) : [],
    );
    const input: DeliberationInput = {
      policy: DEFAULT_POLICY,
      ues: [
        { id: "u1", code: "INF111", title: "Programmation", credits: 6 },
        { id: "u2", code: "MAT112", title: "Mathématiques", credits: 6 },
        { id: "u3", code: "LAN113", title: "Langues", credits: 3 },
      ],
      courses: [course("inf", "u1"), course("mat", "u2"), course("eng", "u3")],
      assignments,
      grades,
      students,
      bonuses: [],
    };
    const decisions = Object.fromEntries(students.map((s) => [s, computeStudent(input, s).decision]));
    expect(decisions).toEqual({
      brenda: "admitted",
      cedric: "admitted_compensation",
      mireille: "admitted",
      yannick: "resit",
      ines: "admitted",
    });
    expect(computeStudent(input, "cedric").semester_average).toBe(10.06);
  });
});
