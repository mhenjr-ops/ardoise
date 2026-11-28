// University course catalogue: import, adding by hand, lecturers claiming, students joining on their own.
import { setup } from './harness.mjs';

const { db, ids, as, check, expectError, done, createSchool } = await setup(['A', 'R', 'T', 'T2', 'H', 'S1', 'S2', 'S3', 'S4', 'S5', 'X', 'O']);
// As the system (no signed-in user), whatever call came before.
const q = async (sql, params = []) => {
  await db.query(`select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false)`);
  return (await db.query(sql, params)).rows;
};

const lv = (await q(`select public.level_year('L1') a, public.level_year('M1') b, public.level_year('Year 3') c,
  public.level_year('Level 200') d, public.level_year('2') e, public.level_year('abc') f, public.level_year('Niveau 2') g`))[0];
check('years of study are read from how levels are written',
  lv.a === 1 && lv.b === 4 && lv.c === 3 && lv.d === 1 && lv.e === 2 && lv.f === null && lv.g === 2);

const inst = await createSchool('A', 'Uni A', 'uni-a');
const other = await createSchool('O', 'Uni O', 'uni-o');
const [fac] = await q(`insert into public.faculties (institution_id, name, code) values ($1, 'National Higher Polytechnic Institute', 'NAHPI') returning id`, [inst]);
const [d1] = await q(`insert into public.departments (institution_id, faculty_id, name) values ($1, $2, 'Civil Engineering') returning id`, [inst, fac.id]);
const [d2] = await q(`insert into public.departments (institution_id, faculty_id, name) values ($1, $2, 'Mechanical Engineering') returning id`, [inst, fac.id]);
const [p1] = await q(`insert into public.programmes (institution_id, department_id, name) values ($1, $2, 'B.Eng Civil') returning id`, [inst, d1.id]);
const [p2] = await q(`insert into public.programmes (institution_id, department_id, name) values ($1, $2, 'B.Eng Mechanical') returning id`, [inst, d2.id]);
const [yr] = await q(`insert into public.academic_years (institution_id, label, is_current, starts_on) values ($1, '2026-2027', true, current_date - 40) returning id`, [inst]);
const [sem1] = await q(`insert into public.semesters (institution_id, academic_year_id, label, starts_on, ends_on) values ($1, $2, 'First Semester', current_date - 30, current_date + 60) returning id`, [inst, yr.id]);
await q(`insert into public.semesters (institution_id, academic_year_id, label, starts_on, ends_on) values ($1, $2, 'Second Semester', current_date + 61, current_date + 200)`, [inst, yr.id]);
await q(`insert into public.memberships (institution_id, user_id, role) values ($1, $2, 'registrar')`, [inst, ids.R]);
await q(`insert into public.memberships (institution_id, user_id, role, department_id) values ($1, $2, 'teacher', $3), ($1, $4, 'teacher', $3)`, [inst, ids.T, d1.id, ids.T2]);
await q(`insert into public.memberships (institution_id, user_id, role, department_id) values ($1, $2, 'hod', $3)`, [inst, ids.H, d1.id]);
for (const s of ['S1', 'S2', 'S3', 'S4', 'S5']) {
  await q(`insert into public.memberships (institution_id, user_id, role) values ($1, $2, 'student')`, [inst, ids[s]]);
}
const place = (s, prog, level) => q(`insert into public.programme_enrollments (institution_id, programme_id, academic_year_id, level, student_id)
  values ($1, $2, $3, $4, $5)`, [inst, prog, yr.id, level, ids[s]]);
await place('S1', p1.id, 'L1');
await place('S2', p1.id, 'Year 2');
await place('S3', p2.id, 'L1');
// S5's courses for the semester come from the registrar's student file.
const [ros] = await q(`insert into public.student_roster (institution_id, matricule, full_name, claimed_by) values ($1, 'UBA26E0005', 'S Five', $2) returning id`, [inst, ids.S5]);
await q(`insert into public.roster_courses (roster_id, institution_id, course_code, semester_id) values ($1, $2, 'MATE2101', $3)`, [ros.id, inst, sem1.id]);
await place('S5', p1.id, 'L1');

// --- Import ---
const rows = [
  { code: 'CVLE2101', title: 'Strength of Materials I', level: 1, semester: 1, credits: 3, school: 'NAHPI', department: 'Civil Engineering' },
  { code: 'MATE 2101', title: 'Engineering Mathematics I', level: '1', semester: '1', school: 'NAHPI', department: 'Civil Engineering' },
  { code: 'mate2101', school: 'National Higher Polytechnic Institute', department: 'Mechanical Engineering' },
  { code: 'CVLE3101', title: 'Theory of Structures I', level: 2, semester: 1, school: 'NAHPI', department: 'Civil Engineering' },
  { code: 'CVLE2201', title: 'Fluid Mechanics', level: 1, semester: 2, school: 'NAHPI', department: 'Civil Engineering' },
  { code: 'X1', title: '' },
  { code: 'ZZ100', title: 'Lonely Course', level: 'L1', school: 'NAHPI', department: 'Nowhere Studies' },
];
await expectError('a student cannot import a catalogue', () => as('S1', `select public.catalogue_import($1, $2::jsonb)`, [inst, JSON.stringify(rows)]), 'forbidden');
await expectError('nor can a lecturer', () => as('T', `select public.catalogue_import($1, $2::jsonb)`, [inst, JSON.stringify(rows)]), 'forbidden');
const imp = (await as('R', `select public.catalogue_import($1, $2::jsonb) as r`, [inst, JSON.stringify(rows)])).rows[0].r;
check('the registrar imports a list: new codes created, repeated codes merged',
  imp.created === 5 && imp.updated === 1 && imp.skipped === 1 && imp.linked === 5);
check('an unknown department is reported, not invented by the school', imp.new_departments === 0 && imp.unknown_departments[0] === 'NAHPI / Nowhere Studies');
const mate = (await q(`select c.code, c.credits, (select count(*)::int from public.catalogue_course_departments d where d.catalogue_id = c.id) as deps
  from public.catalogue_courses c where c.institution_id = $1 and c.code = 'MATE2101'`, [inst]))[0];
check('codes are written one way and shared courses keep every department', mate && mate.deps === 2);
await q(`insert into public.platform_admins (user_id) values ($1)`, [ids.X]);
const team = (await as('X', `select public.catalogue_import($1, $2::jsonb) as r`,
  [inst, JSON.stringify([{ code: 'CYBR5101', title: 'Cryptography', level: 4, semester: 1, school: 'NAHPI', department: 'Centre for Cybersecurity' }])])).rows[0].r;
const newDep = await q(`select faculty_id from public.departments where institution_id = $1 and name = 'Centre for Cybersecurity'`, [inst]);
check('the Ardoise team’s import adds a missing department to its school', team.new_departments === 1 && newDep[0]?.faculty_id === fac.id);

// --- Adding and editing by hand ---
const added = (await as('T', `select public.catalogue_save($1, null, 'cvle 2299', 'Site Visit', 1, 2, 1, $2::uuid[]) as id`, [inst, [d1.id]])).rows[0].id;
check('a lecturer adds a course that is not listed', !!added);
await expectError('but cannot change one', () => as('T', `select public.catalogue_save($1, $2, 'CVLE2299', 'Renamed', 1, 2, 1, '{}')`, [inst, added]), 'forbidden');
await expectError('a code can only be listed once', () => as('T', `select public.catalogue_save($1, null, 'CVLE2101', 'Again', 1, 1, null, '{}')`, [inst]), 'duplicate_code');
await as('H', `select public.catalogue_save($1, $2, 'CVLE2299', 'Site Visit and Report', 1, 2, 2, $3::uuid[])`, [inst, added, [d1.id]]);
check('a head of department edits it', (await q(`select title from public.catalogue_courses where id = $1`, [added]))[0].title === 'Site Visit and Report');
await expectError('a student cannot add courses', () => as('S1', `select public.catalogue_save($1, null, 'HACK1', 'x', 1, 1, null, '{}')`, [inst]), 'forbidden');
check('another university cannot read this catalogue',
  (await as('O', `select id from public.catalogue_courses where institution_id = $1`, [inst])).rows.length === 0);
check('a student of the university can', (await as('S1', `select id from public.catalogue_courses`)).rows.length >= 6);

// --- Lecturers claim, students join ---
const catId = async (code) => (await q(`select id from public.catalogue_courses where institution_id = $1 and code = $2`, [inst, code]))[0].id;
const cvleCat = await catId('CVLE2101');
await expectError('a student cannot claim a course', () => as('S1', `select public.teach_catalogue_course($1)`, [cvleCat]), 'forbidden');
const cvle = (await as('T', `select public.teach_catalogue_course($1) as id`, [await catId('CVLE2101')])).rows[0].id;
const course = (await q(`select semester_id, catalogue_id, department_id, level from public.courses where id = $1`, [cvle]))[0];
check('claiming opens the course for the current semester', course.semester_id === sem1.id && course.department_id === d1.id && course.level === 'Year 1');
const members = async (cid) => (await q(`select user_id, role, added_by from public.enrollments where course_id = $1`, [cid]));
let m = await members(cvle);
const has = (list, who) => list.some((e) => e.user_id === ids[who]);
check('the lecturer teaches it', m.some((e) => e.user_id === ids.T && e.role === 'teacher'));
check('first-year students of the department join on their own', has(m, 'S1') && m.find((e) => e.user_id === ids.S1).added_by === 'auto');
check('second-years do not', !has(m, 'S2'));
check('other departments do not', !has(m, 'S3'));
check('a student whose courses the registrar listed does not', !has(m, 'S5'));
const again = (await as('T2', `select public.teach_catalogue_course($1) as id`, [await catId('CVLE2101')])).rows[0].id;
check('a second lecturer joins the same course', again === cvle && (await members(cvle)).filter((e) => e.role === 'teacher').length === 2);

const mat = (await as('T', `select public.teach_catalogue_course($1) as id`, [await catId('MATE2101')])).rows[0].id;
m = await members(mat);
check('a shared course takes first-years of both departments', has(m, 'S1') && has(m, 'S3') && !has(m, 'S2'));
const fluid = (await as('T', `select public.teach_catalogue_course($1) as id`, [await catId('CVLE2201')])).rows[0].id;
const fluidSem = (await q(`select s.label from public.courses c join public.semesters s on s.id = c.semester_id where c.id = $1`, [fluid]))[0].label;
check('a second-semester course claimed now opens for the second semester', fluidSem === 'Second Semester');
check('and takes its first-year students', has(await members(fluid), 'S1') && !has(await members(fluid), 'S2'));
check('the search shows it as opened and taught', (await as('T', `select teaching from public.catalogue_search($1, 'CVLE2201')`, [inst])).rows[0]?.teaching === true);

await place('S4', p1.id, 'L1');
check('a student placed later joins the courses already open, both semesters', has(await members(cvle), 'S4') && has(await members(mat), 'S4') && has(await members(fluid), 'S4'));

// --- Search ---
const res = (await as('T', `select * from public.catalogue_search($1, '', $2, 1, 1)`, [inst, d1.id])).rows;
check('lecturers search by department, year and semester', res.length === 2 && res.every((r) => r.level === 1 && r.semester_no === 1));
const row = res.find((r) => r.code === 'CVLE2101');
check('and see who teaches it and how many students', row.course_id === cvle && row.teaching === true && row.students === 2 && row.teachers.length > 0);
check('"my courses" lists only theirs', (await as('T2', `select code from public.catalogue_search($1, '', null, null, null, true)`, [inst])).rows.map((r) => r.code).join() === 'CVLE2101');
await expectError('students cannot search the catalogue', () => as('S1', `select * from public.catalogue_search($1)`, [inst]), 'forbidden');

// --- Students drop an elective ---
await as('S1', `select public.drop_course($1)`, [cvle]);
check('a student drops a course they were added to', !has(await members(cvle), 'S1'));
await q(`update public.programme_enrollments set level = 'Year 1' where student_id = $1`, [ids.S1]);
check('and is not added back', !has(await members(cvle), 'S1'));
const [manual] = await q(`insert into public.courses (institution_id, code, title) values ($1, 'LAB100', 'Lab') returning id`, [inst]);
await q(`insert into public.enrollments (institution_id, course_id, user_id, role) values ($1, $2, $3, 'student')`, [inst, manual.id, ids.S2]);
await expectError('a course the school put them in cannot be dropped', () => as('S2', `select public.drop_course($1)`, [manual.id]), 'forbidden');

// --- Every course is in the catalogue ---
await q(`insert into public.courses (institution_id, code, title, department_id) values ($1, 'new 101', 'New Course', $2)`, [inst, d2.id]);
const nc = (await q(`select c.source, (select department_id from public.catalogue_course_departments d where d.catalogue_id = c.id) as dep
  from public.catalogue_courses c where c.institution_id = $1 and c.code = 'NEW101'`, [inst]))[0];
check('a course created another way is added to the catalogue', nc?.source === 'course' && nc.dep === d2.id);

// --- Retiring ---
const structCat = await catId('CVLE3101');
await expectError('a lecturer cannot retire a course', () => as('T', `select public.catalogue_retire($1, true)`, [structCat]), 'forbidden');
await as('R', `select public.catalogue_retire($1, true)`, [structCat]);
check('a retired course is hidden from lecturers', !(await as('T', `select code from public.catalogue_search($1, 'CVLE3101')`, [inst])).rows.length);
check('but the registrar still sees it', (await as('R', `select retired from public.catalogue_search($1, 'CVLE3101')`, [inst])).rows[0]?.retired === true);
await expectError('and it cannot be opened', () => as('T', `select public.teach_catalogue_course($1)`, [structCat]), 'invalid');
check('another university is untouched', (await q(`select count(*)::int as n from public.catalogue_courses where institution_id = $1`, [other]))[0].n === 0);
done();
