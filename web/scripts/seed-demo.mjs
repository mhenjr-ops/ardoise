// Demo data for Ardoise: one institution, 3 courses, teachers, students,
// modules, pages, assignments, a submission and some grades.
//
//   node --env-file=.env.local scripts/seed-demo.mjs
//
// Needs SUPABASE_SERVICE_ROLE_KEY (server-only key; never ship it to a browser).
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const PASSWORD = "Ardoise2026!";
const SLUG = "isdy";

function must(result, label) {
  if (result.error) {
    console.error(`✗ ${label}:`, result.error.message);
    process.exit(1);
  }
  return result.data;
}

const days = (n) => new Date(Date.now() + n * 86400000).toISOString();

const existing = must(await db.from("institutions").select("id").eq("slug", SLUG).maybeSingle(), "check institution");
if (existing) {
  console.log(`Demo institution "${SLUG}" already exists. Delete it in Supabase to re-seed.`);
  process.exit(0);
}

const people = [
  { key: "admin", email: "admin@demo.ardoise.cm", name: "Admin Démo", locale: "fr", roles: ["admin", "registrar"] },
  { key: "mbarga", email: "j.mbarga@demo.ardoise.cm", name: "Dr Jean-Paul Mbarga", locale: "fr", roles: ["teacher"] },
  { key: "bello", email: "a.bello@demo.ardoise.cm", name: "Dr Aïcha Bello", locale: "en", roles: ["teacher"] },
  { key: "brenda", email: "brenda@demo.ardoise.cm", name: "Brenda Fon", locale: "en", roles: ["student"] },
  { key: "cedric", email: "cedric@demo.ardoise.cm", name: "Cédric Nkoulou", locale: "fr", roles: ["student"] },
  { key: "mireille", email: "mireille@demo.ardoise.cm", name: "Mireille Tchoumi", locale: "fr", roles: ["student"] },
  { key: "yannick", email: "yannick@demo.ardoise.cm", name: "Yannick Abena", locale: "fr", roles: ["student"] },
  { key: "ines", email: "ines@demo.ardoise.cm", name: "Inès Kamga", locale: "fr", roles: ["student"] },
];

const ids = {};
for (const p of people) {
  const { data, error } = await db.auth.admin.createUser({
    email: p.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: p.name, locale: p.locale },
  });
  if (error && !/already/i.test(error.message)) {
    console.error(`✗ create ${p.email}:`, error.message);
    process.exit(1);
  }
  if (data?.user) {
    ids[p.key] = data.user.id;
  } else {
    const found = must(await db.from("profiles").select("id").eq("email", p.email).single(), `find ${p.email}`);
    ids[p.key] = found.id;
  }
}
console.log("✓ users");

const inst = must(
  await db.from("institutions").insert({ name: "Institut Supérieur Démo de Yaoundé", slug: SLUG }).select("id").single(),
  "institution",
);
must(
  await db.from("memberships").insert(
    people.flatMap((p) => p.roles.map((role) => ({ institution_id: inst.id, user_id: ids[p.key], role }))),
  ),
  "memberships",
);
console.log("✓ institution and members");

const courseDefs = [
  {
    code: "INF101",
    title: "Algorithmique et programmation",
    level: "L1",
    language: "fr",
    color: "#0E7C66",
    teacher: "mbarga",
    description:
      "Introduction aux algorithmes : variables, conditions, boucles, fonctions et tableaux. TP en Python.\nÉvaluation : CC 30 %, TP 20 %, examen 50 %.",
  },
  {
    code: "MAT102",
    title: "Analyse I",
    level: "L1",
    language: "fr",
    color: "#1F6FEB",
    teacher: "bello",
    description: "Suites, limites, continuité et dérivabilité des fonctions d'une variable réelle.",
  },
  {
    code: "ENG110",
    title: "Technical English",
    level: "L1",
    language: "en",
    color: "#8250DF",
    teacher: "bello",
    description: "Reading and writing technical documents in English: reports, emails and short presentations.",
  },
];

const students = ["brenda", "cedric", "mireille", "yannick", "ines"];
const courses = {};
for (const c of courseDefs) {
  const { teacher, ...fields } = c;
  const row = must(await db.from("courses").insert({ ...fields, institution_id: inst.id }).select("id").single(), c.code);
  courses[c.code] = row.id;
  must(
    await db.from("enrollments").insert([
      { course_id: row.id, user_id: ids[teacher], role: "teacher" },
      ...students.map((s) => ({ course_id: row.id, user_id: ids[s], role: "student" })),
    ]),
    `${c.code} enrollments`,
  );
}
console.log("✓ courses and enrollments");

// INF101 content
const inf = courses.INF101;
const m1 = must(await db.from("modules").insert({ course_id: inf, title: "Semaine 1 — Premiers pas", position: 1 }).select("id").single(), "module 1");
const m2 = must(await db.from("modules").insert({ course_id: inf, title: "Semaine 2 — Conditions et boucles", position: 2 }).select("id").single(), "module 2");

const p1 = must(
  await db
    .from("pages")
    .insert({
      course_id: inf,
      title: "Bienvenue dans INF101",
      body:
        "Bonjour à toutes et à tous,\n\nCe cours se déroule en présentiel le lundi et le jeudi, amphi 300.\nLes supports sont publiés ici chaque semaine. Les TP se rendent sur Ardoise, en PDF ou en photo depuis votre téléphone.\n\nBon semestre !",
    })
    .select("id")
    .single(),
  "page 1",
);
const p2 = must(
  await db
    .from("pages")
    .insert({
      course_id: inf,
      title: "Cours 2 : les boucles for et while",
      body: "Une boucle répète un bloc d'instructions.\n\nfor i in range(5):\n    print(i)\n\nwhile n > 0:\n    n = n - 1",
    })
    .select("id")
    .single(),
  "page 2",
);

const tp1 = must(
  await db
    .from("assignments")
    .insert({
      course_id: inf,
      title: "TP 1 — Calcul de moyenne",
      description: "Écrire un programme qui lit 5 notes sur 20 et affiche la moyenne. Rendre le code et une capture d'écran.",
      due_at: days(5),
      points_possible: 20,
      component: "tp",
      weight: 1,
    })
    .select("id")
    .single(),
  "TP1",
);
const cc1 = must(
  await db
    .from("assignments")
    .insert({
      course_id: inf,
      title: "Contrôle continu 1",
      description: "Devoir sur table, salle 12. Saisie des notes après correction.",
      due_at: days(-3),
      points_possible: 20,
      component: "cc",
      weight: 1.5,
      submission_types: ["file"],
    })
    .select("id")
    .single(),
  "CC1",
);
const tp2 = must(
  await db
    .from("assignments")
    .insert({
      course_id: inf,
      title: "TP 2 — Table de multiplication",
      description: "Afficher la table de multiplication d'un entier saisi, avec une boucle for puis une boucle while.",
      due_at: days(12),
      points_possible: 10,
      component: "tp",
      weight: 1,
    })
    .select("id")
    .single(),
  "TP2",
);

must(
  await db.from("module_items").insert([
    { module_id: m1.id, item_type: "page", title: "Bienvenue dans INF101", page_id: p1.id, position: 1 },
    { module_id: m1.id, item_type: "header", title: "Travaux pratiques", position: 2 },
    { module_id: m1.id, item_type: "assignment", title: "TP 1 — Calcul de moyenne", assignment_id: tp1.id, position: 3 },
    { module_id: m1.id, item_type: "link", title: "Documentation Python (FR)", url: "https://docs.python.org/fr/3/", position: 4 },
    { module_id: m2.id, item_type: "page", title: "Cours 2 : les boucles for et while", page_id: p2.id, position: 1 },
    { module_id: m2.id, item_type: "assignment", title: "TP 2 — Table de multiplication", assignment_id: tp2.id, position: 2 },
    { module_id: m2.id, item_type: "assignment", title: "Contrôle continu 1", assignment_id: cc1.id, position: 3 },
  ]),
  "module items",
);

must(
  await db.from("announcements").insert([
    {
      course_id: inf,
      title: "Salle changée pour jeudi",
      body: "Le cours de jeudi aura lieu en salle 12 (bâtiment B), même horaire.",
      author_id: ids.mbarga,
    },
    {
      course_id: inf,
      title: "Notes du CC1 disponibles",
      body: "Les notes du contrôle continu 1 sont dans l'onglet Notes. Réclamations jusqu'à vendredi.",
      author_id: ids.mbarga,
    },
  ]),
  "announcements",
);

must(
  await db.from("submissions").insert({
    assignment_id: tp1.id,
    student_id: ids.brenda,
    body: "notes = [12, 15, 9, 17, 14]\nprint(sum(notes) / len(notes))  # 13.4",
  }),
  "submission",
);

const ccMarks = { brenda: 14.5, cedric: 11, mireille: 16, yannick: 8.5, ines: 12.75 };
must(
  await db.from("grades").insert(
    Object.entries(ccMarks).map(([s, score]) => ({
      assignment_id: cc1.id,
      student_id: ids[s],
      score,
      graded_by: ids.mbarga,
      comment: score < 10 ? "Revoir les boucles, passez au tutorat." : null,
    })),
  ),
  "grades",
);

// MAT102 and ENG110: one module and one assignment each
const mat = courses.MAT102;
const matMod = must(await db.from("modules").insert({ course_id: mat, title: "Chapitre 1 — Suites", position: 1 }).select("id").single(), "MAT module");
const matTd = must(
  await db
    .from("assignments")
    .insert({ course_id: mat, title: "TD 1 — Suites arithmétiques", due_at: days(7), points_possible: 20, component: "cc" })
    .select("id")
    .single(),
  "MAT TD1",
);
must(
  await db.from("module_items").insert({ module_id: matMod.id, item_type: "assignment", title: "TD 1 — Suites arithmétiques", assignment_id: matTd.id, position: 1 }),
  "MAT item",
);

const eng = courses.ENG110;
must(
  await db.from("announcements").insert({
    course_id: eng,
    title: "Welcome to Technical English",
    body: "Please bring a notebook on Tuesday. Our first task is a short self-introduction email.",
    author_id: ids.bello,
  }),
  "ENG announcement",
);
must(
  await db
    .from("assignments")
    .insert({ course_id: eng, title: "Writing task 1 — Self-introduction email", due_at: days(4), points_possible: 20, component: "cc" }),
  "ENG task",
);

console.log("✓ content, submissions and grades");

// ---------------------------------------------------------------------
// Sprint 2: LMD structure, a full semester of marks, a quiz
// ---------------------------------------------------------------------
const fac = must(await db.from("faculties").insert({ institution_id: inst.id, name: "Faculté des Sciences", code: "FS" }).select("id").single(), "faculty");
const dep = must(await db.from("departments").insert({ institution_id: inst.id, faculty_id: fac.id, name: "Informatique", code: "INFO" }).select("id").single(), "department");
const prog = must(
  await db.from("programmes").insert({ institution_id: inst.id, department_id: dep.id, name: "Licence Informatique", code: "LINF", cycle: "licence" }).select("id").single(),
  "programme",
);
const year = must(await db.from("academic_years").insert({ institution_id: inst.id, label: "2026-2027", is_current: true }).select("id").single(), "year");
const s1 = must(await db.from("semesters").insert({ institution_id: inst.id, academic_year_id: year.id, label: "S1" }).select("id").single(), "S1");
must(await db.from("semesters").insert({ institution_id: inst.id, academic_year_id: year.id, label: "S2" }), "S2");

const ueDefs = [
  ["INF111", "Programmation", 6, "INF101"],
  ["MAT112", "Mathématiques", 6, "MAT102"],
  ["LAN113", "Langues", 3, "ENG110"],
];
for (const [code, title, credits, courseCode] of ueDefs) {
  const ue = must(
    await db.from("teaching_units").insert({ institution_id: inst.id, programme_id: prog.id, semester_id: s1.id, code, title, credits, level: "L1" }).select("id").single(),
    code,
  );
  must(await db.from("courses").update({ teaching_unit_id: ue.id, semester_id: s1.id, coefficient: 1 }).eq("id", courses[courseCode]), `map ${courseCode}`);
}
must(
  await db.from("programme_enrollments").insert(students.map((s) => ({ programme_id: prog.id, academic_year_id: year.id, level: "L1", student_id: ids[s] }))),
  "programme enrollments",
);
console.log("✓ programme, semesters, teaching units, registrations");

async function addGraded(courseId, title, component, points, marks, dueDays) {
  const a = must(
    await db.from("assignments").insert({ course_id: courseId, title, component, points_possible: points, due_at: days(dueDays), submission_types: ["file"] }).select("id").single(),
    title,
  );
  must(
    await db.from("grades").insert(Object.entries(marks).map(([s, score]) => ({ assignment_id: a.id, student_id: ids[s], score, graded_by: null }))),
    `${title} marks`,
  );
  return a.id;
}
//                                   brenda cedric mireille yannick ines
const row = (b, c, m, y, i) => ({ brenda: b, cedric: c, mireille: m, yannick: y, ines: i });
must(await db.from("grades").insert(Object.entries(row(15, 12, 17, 9, 13)).map(([s, score]) => ({ assignment_id: tp1.id, student_id: ids[s], score }))), "TP1 marks");
must(await db.from("grades").insert(Object.entries(row(8, 6, 9, 4, 7)).map(([s, score]) => ({ assignment_id: tp2.id, student_id: ids[s], score }))), "TP2 marks");
await addGraded(inf, "Examen final INF101", "exam", 20, row(13, 10.5, 15.5, 7, 11), -1);
must(await db.from("grades").insert(Object.entries(row(12, 8, 14, 6, 10)).map(([s, score]) => ({ assignment_id: matTd.id, student_id: ids[s], score }))), "TD1 marks");
await addGraded(mat, "Examen final MAT102", "exam", 20, row(11.5, 8, 13, 5.5, 10.5), -1);
const engTask = must(await db.from("assignments").select("id").eq("course_id", eng).limit(1).single(), "ENG task");
must(await db.from("grades").insert(Object.entries(row(16, 13, 15, 11, 14)).map(([s, score]) => ({ assignment_id: engTask.id, student_id: ids[s], score }))), "ENG marks");
await addGraded(eng, "Final exam ENG110", "exam", 20, row(14, 12, 14.5, 10, 12.5), -1);
console.log("✓ semester marks (expected: 3 passed, 1 passed by compensation, 1 resit)");

// A practice quiz (weight 0, so it never pulls the CC average down)
const bank = must(await db.from("question_banks").insert({ course_id: inf, title: "Chapitre 1 — Bases de Python" }).select("id").single(), "bank");
const quizQuestions = [
  ["single", "Quelle instruction affiche un texte à l'écran ?", [{ id: "a", text: "print()" }, { id: "b", text: "input()" }, { id: "c", text: "len()" }], 2, "a"],
  ["multiple", "Lesquels sont des types de base en Python ?", [{ id: "a", text: "int" }, { id: "b", text: "loop" }, { id: "c", text: "str" }, { id: "d", text: "float" }], 3, ["a", "c", "d"]],
  ["true_false", "Une boucle while s'arrête quand sa condition devient fausse.", [], 1, true],
  ["numeric", "Que vaut 7 // 2 en Python ?", [], 2, { value: 3, tolerance: 0 }],
  ["short", "Quel mot-clé définit une fonction ?", [], 2, ["def"]],
  ["essay", "Expliquez en quelques lignes la différence entre une boucle for et une boucle while.", [], 5, null],
];
for (const [i, [qtype, prompt, options, points, correct]] of quizQuestions.entries()) {
  const q = must(await db.from("questions").insert({ bank_id: bank.id, qtype, prompt, options, points, position: i + 1 }).select("id").single(), `question ${i + 1}`);
  must(await db.from("question_keys").insert({ question_id: q.id, correct }), `key ${i + 1}`);
}
const quizAsg = must(
  await db
    .from("assignments")
    .insert({ course_id: inf, title: "Quiz 1 — Bases de Python", description: "15 minutes, 2 tentatives. Quiz d'entraînement (coefficient 0).", due_at: days(6), points_possible: 20, component: "cc", weight: 0, submission_types: ["quiz"] })
    .select("id")
    .single(),
  "quiz assignment",
);
must(await db.from("quizzes").insert({ assignment_id: quizAsg.id, bank_id: bank.id, time_limit_minutes: 15, attempts_allowed: 2, show_results: "after_submit" }), "quiz");
must(await db.from("module_items").insert({ module_id: m1.id, item_type: "assignment", title: "Quiz 1 — Bases de Python", assignment_id: quizAsg.id, position: 5 }), "quiz item");
console.log("✓ question bank and quiz");
console.log(`\nDone. Sign in with any of these (password: ${PASSWORD}):`);
for (const p of people) console.log(`  ${p.roles.join("/").padEnd(16)} ${p.email}`);
