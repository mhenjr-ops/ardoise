// Form B: a student registers the year's courses from the form printed by the portal.
// Also: course-by-course draft transcripts (no teaching units).
import { setup } from './harness.mjs';

const { db, ids, as, check, expectError, done, createSchool } = await setup(['A', 'T', 'S1', 'S2', 'S3']);
const q = async (sql, params = []) => {
  await db.query(`select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false)`);
  return (await db.query(sql, params)).rows;
};
const inst = await createSchool('A', 'Uni A', 'uni-a');
const [fac] = await q(`insert into public.faculties (institution_id, name, code) values ($1, 'National Higher Polytechnic Institute', 'NAHPI') returning id`, [inst]);
const [civ] = await q(`insert into public.departments (institution_id, faculty_id, name) values ($1, $2, 'Civil Engineering and Architecture') returning id`, [inst, fac.id]);
const [prog] = await q(`insert into public.programmes (institution_id, department_id, name, code) values ($1, $2, 'B.Eng. Civil Engineering', 'CVLE') returning id`, [inst, civ.id]);
const [yr] = await q(`insert into public.academic_years (institution_id, label, is_current, starts_on) values ($1, '2026/2027', true, current_date - 40) returning id`, [inst]);
const [sem1] = await q(`insert into public.semesters (institution_id, academic_year_id, label, starts_on, ends_on) values ($1, $2, 'First Semester', current_date - 30, current_date + 60) returning id`, [inst, yr.id]);
const [sem2] = await q(`insert into public.semesters (institution_id, academic_year_id, label, starts_on, ends_on) values ($1, $2, 'Second Semester', current_date + 61, current_date + 200) returning id`, [inst, yr.id]);
await q(`insert into public.memberships (institution_id, user_id, role, department_id) values ($1, $2, 'teacher', $3)`, [inst, ids.T, civ.id]);
const student = async (key, mat) => {
  await q(`insert into public.memberships (institution_id, user_id, role) values ($1, $2, 'student')`, [inst, ids[key]]);
  await q(`insert into public.student_roster (institution_id, matricule, full_name, claimed_by, claimed_at) values ($1, $2, $3, $4, now())`, [inst, mat, `Student ${key}`, ids[key]]);
};
await student('S1', 'UBA26E0412');
await student('S2', 'UBA26E0415');

// The catalogue: department courses and shared ones filed elsewhere.
const cat = async (code, title, level, sem, credits, dep) => {
  const [c] = await q(`insert into public.catalogue_courses (institution_id, code, title, level, semester_no, credits) values ($1, $2, $3, $4, $5, $6) returning id`, [inst, code, title, level, sem, credits]);
  if (dep) await q(`insert into public.catalogue_course_departments values ($1, $2)`, [c.id, dep]);
  return c.id;
};
await cat('CVLE2101', 'Strength of Materials I', 1, 1, 3, civ.id);
await cat('CVLE2103', 'Mechanics I', 1, 1, 2, civ.id);
await cat('MATE2101', 'Engineering Mathematics 1', 1, 1, 4, null);
await cat('FENG2101', 'Functional English I', 1, 1, 2, null);
await cat('CVLE2201', 'Fluid Mechanics', 1, 2, 3, civ.id);

await q(`insert into public.programme_enrollments (institution_id, programme_id, academic_year_id, level, student_id) values ($1, $2, $3, '200', $4), ($1, $2, $3, '200', $5)`,
  [inst, prog.id, yr.id, ids.S1, ids.S2]);
// Opened this semester: two department courses and the shared maths course.
const open = async (code) => (await q(`insert into public.courses (institution_id, code, title, department_id, semester_id) values ($1, $2, $2, $3, $4) returning id`, [inst, code, civ.id, sem1.id]))[0].id;
const cvle1 = await open('CVLE2101');
const cvle3 = await open('CVLE2103');
const [mate] = await q(`insert into public.courses (institution_id, code, title, semester_id) values ($1, 'MATE2101', 'Engineering Mathematics 1', $2) returning id`, [inst, sem1.id]);
const inCourse = async (cid, key) => (await q(`select added_by from public.enrollments where course_id = $1 and user_id = $2`, [cid, ids[key]]))[0];
check('before the form, only the department courses', !!(await inCourse(cvle1, 'S1')) && !(await inCourse(mate.id, 'S1')));

const SHA = (n) => n.repeat(64).slice(0, 64);
const form = (mat, year = '2026/2027') => `UNIVERSITY OF BAMENDA  COURSE REGISTRATION FORM (FORM B)
Name: Student   Matricule: ${mat}   Academic year: ${year}
Level 200   Civil Engineering and Architecture
CVLE 2101  Strength of Materials I  3  C
MATE2101   Engineering Mathematics 1  4  C
FENG-2101  Functional English I  2  C
CVLE2201   Fluid Mechanics  3  C
ROOM 101   (not a course)`;

const pre = (await as('S1', `select public.form_b_check($1, $2) as r`, [SHA('a'), form('UBA26E 0412')])).rows[0].r;
check('the preview finds the student\'s matricule, however it is spaced', pre.matricule_ok === true);
check('and this year', pre.year_ok === true);
check('and the catalogue courses on it, both semesters', pre.courses.map((c) => c.code).join() === 'CVLE2101,FENG2101,MATE2101,CVLE2201');
check('saying which are open now and which wait for a lecturer',
  pre.courses.find((c) => c.code === 'CVLE2101').status === 'in' && pre.courses.find((c) => c.code === 'MATE2101').status === 'joins'
  && pre.courses.find((c) => c.code === 'CVLE2201').status === 'waiting');
check('codes not in the catalogue are listed apart', pre.unknown.includes('ROOM101'));

await expectError('someone else\'s Form B is refused', () => as('S2', `select public.form_b_apply($1, $2)`, [SHA('b'), form('UBA26E0412')]), 'form_b_not_yours');
await expectError('so is last year\'s', () => as('S1', `select public.form_b_apply($1, $2)`, [SHA('c'), form('UBA26E0412', '2025/2026')]), 'form_b_wrong_year');
await expectError('and one with no catalogue courses', () => as('S1', `select public.form_b_apply($1, $2)`, [SHA('d'), 'Matricule UBA26E0412 2026/2027 nothing here']), 'form_b_no_courses');
await expectError('a lecturer has no Form B', () => as('T', `select public.form_b_check($1, $2)`, [SHA('e'), form('UBA26E0412')]), 'no_matricule');

const res = (await as('S1', `select public.form_b_apply($1, $2) as r`, [SHA('a'), form('UBA26E0412')])).rows[0].r;
check('applying registers every course on it; two wait for a lecturer', res.registered === 4 && res.waiting === 2 && res.joined === 2);
check('the student joins the open course that was missing', (await inCourse(mate.id, 'S1'))?.added_by === null);
check('a course on the form becomes a registration, not an automatic one', (await inCourse(cvle1, 'S1'))?.added_by === null);
check('an automatic course not on the form is dropped', !(await inCourse(cvle3, 'S1')) && res.removed === 1);
const later = (await q(`insert into public.courses (institution_id, code, title, department_id, semester_id) values ($1, 'CVLE2201', 'Fluid Mechanics', $2, $3) returning id`, [inst, civ.id, sem2.id]))[0].id;
check('a course on the form joins them when it opens', !!(await inCourse(later, 'S1')));
check('and it isn\'t re-added to the dropped course', !(await inCourse(cvle3, 'S1')));

await q(`update public.student_roster set matricule = 'UBA26E0412X' where claimed_by = $1`, [ids.S2]);
await expectError('the same file cannot serve a second account', () => as('S2', `select public.form_b_apply($1, $2)`, [SHA('a'), form('UBA26E0412X')]), 'form_b_used');
check('the preview says so too', (await as('S2', `select public.form_b_check($1, $2) as r`, [SHA('a'), form('UBA26E0412X')])).rows[0].r.used_by_other === true);
const again = (await as('S1', `select public.form_b_apply($1, $2) as r`, [SHA('a'), form('UBA26E0412')])).rows[0].r;
check('its owner can send it again (after add/drop)', again.registered === 4);
check('the student sees their own uploads only', (await as('S2', `select id from public.form_b_uploads`)).rows.length === 0
  && (await as('S1', `select id from public.form_b_uploads`)).rows.length === 1);

// Course-by-course draft transcript: no teaching units, credits from the catalogue.
const [ca] = await q(`insert into public.assignments (course_id, title, points_possible, component) values ($1, 'CA', 30, 'cc') returning id`, [mate.id]);
const [ex] = await q(`insert into public.assignments (course_id, title, points_possible, component) values ($1, 'Exam', 70, 'exam') returning id`, [mate.id]);
await q(`update public.courses set component_weights = '{"cc":30,"exam":70}' where id = $1`, [mate.id]);
await q(`insert into public.grades (institution_id, course_id, assignment_id, student_id, score) values ($1, $2, $3, $4, 24), ($1, $2, $5, $4, 49)`, [inst, mate.id, ca.id, ids.S1, ex.id]);
const d = (await as('S1', `select public.draft_transcript_data() as d`)).rows[0].d;
const s1 = d.semesters.find((s) => s.label === 'First Semester');
check('each course the student is in is a transcript line', s1.ues.map((u) => u.code).sort().join() === 'CVLE2101,MATE2101');
check('with its catalogue credits', Number(s1.ues.find((u) => u.code === 'MATE2101').credits) === 4);
check('and its marks', s1.grades.length === 2 && s1.assignments.length === 2);
check('a semester with a registered course is listed', d.semesters.map((s) => s.label).join() === 'First Semester,Second Semester');
const d3 = (await as('S3', `select public.draft_transcript_data() as d`)).rows[0].d;
check('someone with no placement still gets nothing', d3 === null);
done();
