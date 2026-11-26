// Roles and joining: schools created by the platform, invitations, scoped powers,
// oversight, the student list, matricule claims and matricule sign-in.
import { setup } from './harness.mjs';

const { db, ids, as, setAal, check, expectError, done } = await setup([
  'P', 'O', 'AD', 'R', 'D', 'H', 'H2', 'T', 'T2', 'S1', 'S2', 'S3', 'S4', 'Z', 'Q1', 'Q2',
]);
const one = async (user, sql, params) => (await as(user, sql, params)).rows[0];
const count = async (user, sql, params) => Number((await as(user, sql, params)).rows[0].n);

// --- Platform -----------------------------------------------------------
await db.query('insert into public.platform_admins (user_id) values ($1)', [ids.P]);
await expectError('an ordinary user cannot create a school',
  () => as('Z', `select public.create_school('Fake University', 'fake')`), 'forbidden');
const ownerToken = (await one('P', `select public.create_school('Université Test', 'ut', 'en', 'o@demo.cm', 'Owner Person') as t`)).t;
check('the platform creates a school with an owner invitation', typeof ownerToken === 'string' && ownerToken.length >= 60);
const inst = (await one('P', `select id from public.institutions where slug = 'ut'`)).id;
check('the platform admin is not a member of the school', (await count('P', `select count(*) n from public.memberships where institution_id = $1`, [inst])) === 0);
check('the platform admin can list schools', (await count('P', `select count(*) n from public.institutions`)) >= 1);
check('an outsider cannot see the school', (await count('Z', `select count(*) n from public.institutions where id = $1`, [inst])) === 0);

// A new university starts as a prospect: prepared by the Ardoise team, closed to the public.
check('a new university starts as a prospect', (await one('P', `select status from public.institutions where id = $1`, [inst])).status === 'prospect');
check('a prospect is not in the sign-up list',
  !(await as(null, `select * from public.school_directory()`, [], 'anon')).rows.some((s) => s.slug === 'ut'));
check('students cannot join a prospect with a matricule (it answers like an unknown university)',
  (await one('S4', `select public.claim_matricule('ut', 'X1', 'Someone') as r`)).r.status === 'school_not_found');
check('…and no claim is left waiting for it', (await db.query(`select count(*)::int n from public.matricule_claims where institution_id = $1`, [inst])).rows[0].n === 0);
await expectError('only the Ardoise team opens a university', () => as('Z', `select public.set_institution_status($1, 'live')`, [inst]), 'forbidden');
await as('P', `select public.set_institution_status($1, 'live')`, [inst]);

const directory = (await as(null, `select * from public.school_directory()`, [], 'anon')).rows;
check('anyone can list schools by name and link (nothing else)',
  directory.some((s) => s.slug === 'ut' && s.name === 'Université Test') && Object.keys(directory[0]).join() === 'slug,name');
const preview = (await as(null, `select public.invitation_preview($1) as p`, [ownerToken], 'anon')).rows[0].p;
check('anyone with the link sees what it is for', preview.institution === 'Université Test' && preview.role === 'owner' && preview.status === 'open');
check('the invited email is only hinted', preview.email_hint === 'o•••@demo.cm');
check('a wrong token shows nothing', (await as(null, `select public.invitation_preview('nope') as p`, [], 'anon')).rows[0].p === null);

await expectError('only the invited email can use an email-bound invitation',
  () => as('Z', `select public.accept_invitation($1)`, [ownerToken]), 'invitation_wrong_email');
await as('O', `select public.accept_invitation($1)`, [ownerToken]);
check('the owner joined', (await one('O', `select role from public.memberships where institution_id = $1 and user_id = $2`, [inst, ids.O])).role === 'owner');
await expectError('an invitation works once', () => as('Z', `select public.accept_invitation($1)`, [ownerToken]), 'invitation_used');

await as(null, `select public.request_demo('Jean Test', 'jean@uni.cm', '+237 6', 'Université X', 'Recteur', 'Douala', 'Bonjour')`, [], 'anon');
check('a visitor can request a demo', (await count('P', `select count(*) n from public.demo_requests`)) === 1);
check('school users cannot read demo requests', (await count('O', `select count(*) n from public.demo_requests`)) === 0);
await as(null, `select public.request_demo('Jean Test', 'jean@uni.cm', null, 'Université X', null, null, '')`, [], 'anon');
await as(null, `select public.request_demo('Jean Test', 'JEAN@uni.cm', null, 'Université X', null, null, '')`, [], 'anon');
await expectError('demo requests are rate limited per email',
  () => as(null, `select public.request_demo('Jean Test', 'jean@uni.cm', null, 'Université X', null, null, '')`, [], 'anon'), 'too_many_requests');

// --- Structure (admin's job) --------------------------------------------
const join = async (user, token) => as(user, `select public.accept_invitation($1)`, [token]);
const invite = async (by, role, opts = {}) =>
  (await one(by, `select public.create_invitation($1, $2, $3, $4, $5, $6) as t`,
    [inst, role, opts.email ?? null, opts.name ?? '', opts.faculty ?? null, opts.department ?? null])).t;

await join('AD', await invite('O', 'admin'));
await expectError('an admin cannot create another admin', () => invite('AD', 'admin'), 'forbidden');
await expectError('an admin cannot create an owner', () => invite('AD', 'owner'), 'forbidden');
await join('R', await invite('AD', 'registrar'));

// The structure is set up by the Ardoise team, not by the school.
await expectError('the owner does not build the structure',
  () => as('O', `insert into public.faculties (institution_id, name) values ($1, 'X')`, [inst]), 'row-level security');
await expectError('the registrar does not edit the structure',
  () => as('R', `insert into public.faculties (institution_id, name) values ($1, 'X')`, [inst]), 'row-level security');
await expectError('only the Ardoise team imports a structure',
  () => as('O', `select public.import_structure($1, '[]'::jsonb)`, [inst]), 'forbidden');
const imported = (await one('P', `select public.import_structure($1, $2::jsonb) as r`, [inst, JSON.stringify([
  { name: 'Sciences', code: 'FS', departments: [{ name: 'Informatique' }, { name: 'Mathématiques', programmes: [{ name: 'Licence Maths', code: 'LMATH' }] }] },
  { name: 'Lettres', departments: [{ name: 'Histoire' }] },
  { name: 'HND Programmes', code: 'HND', kind: 'school', departments: [{ name: 'Higher National Diploma', programmes: [{ name: 'Civil Engineering', code: 'CVEN', cycle: 'hnd' }] }] },
])])).r;
check('the Ardoise team imports a whole structure at once', imported.units === 3 && imported.departments === 4 && imported.programmes === 2);
const again = (await one('P', `select public.import_structure($1, $2::jsonb) as r`, [inst, JSON.stringify([
  { name: 'FS', departments: [{ name: 'informatique' }, { name: 'Physique' }] },
])])).r;
check('importing again only adds what is missing (matched by code or name)', again.units === 0 && again.departments === 1 && again.programmes === 0);
const fac = (await one('P', `select id from public.faculties where institution_id = $1 and code = 'FS'`, [inst])).id;
const fac2 = (await one('P', `select id from public.faculties where institution_id = $1 and name = 'Lettres'`, [inst])).id;
const info = (await one('P', `select id from public.departments where institution_id = $1 and name = 'Informatique'`, [inst])).id;
const math = (await one('P', `select id from public.departments where institution_id = $1 and name = 'Mathématiques'`, [inst])).id;
const hist = (await one('P', `select id from public.departments where institution_id = $1 and name = 'Histoire'`, [inst])).id;
check('schools and colleges are told apart from faculties', (await one('P', `select kind from public.faculties where code = 'HND'`)).kind === 'school');
check('HND programmes keep their cycle', (await one('P', `select cycle from public.programmes where code = 'CVEN'`)).cycle === 'hnd');
check('members see their structure', (await count('R', `select count(*) n from public.departments where institution_id = $1`, [inst])) === 5);
check('outsiders do not', (await count('Z', `select count(*) n from public.departments where institution_id = $1`, [inst])) === 0);

const physique = (await one('P', `select id from public.departments where institution_id = $1 and name = 'Physique'`, [inst])).id;
await expectError('a school cannot remove a department', () => as('O', `select public.remove_structure_item('department', $1)`, [physique]), 'forbidden');
await as('P', `select public.remove_structure_item('department', $1)`, [physique]);
check('the Ardoise team removes an empty department', (await count('P', `select count(*) n from public.departments where id = $1`, [physique])) === 0);
await expectError('a department with programmes stays', () => as('P', `select public.remove_structure_item('department', $1)`, [math]), 'in_use');
await expectError('a faculty with departments stays', () => as('P', `select public.remove_structure_item('unit', $1)`, [fac]), 'in_use');
await as('O', `insert into public.support_requests (institution_id, body) values ($1, 'Please add a Department of Chemistry.')`, [inst]);
await as('R', `insert into public.support_requests (institution_id, body) values ($1, 'Rename Licence Info.')`, [inst]);
check('the Ardoise team sees the school\'s change requests', (await count('P', `select count(*) n from public.support_requests where institution_id = $1`, [inst])) === 2);
check('the school office sees its own requests', (await count('AD', `select count(*) n from public.support_requests where institution_id = $1`, [inst])) === 2);
check('outsiders see none', (await count('Z', `select count(*) n from public.support_requests`)) === 0);
await expectError('a request cannot be marked done by the school',
  () => as('O', `insert into public.support_requests (institution_id, body, handled_at) values ($1, 'x x x', now())`, [inst]), 'row-level security');

await expectError('a dean needs a faculty', () => invite('AD', 'dean'), 'violates check constraint');
await join('D', await invite('AD', 'dean', { faculty: fac }));
await expectError('a dean cannot appoint a head outside their faculty', () => invite('D', 'hod', { department: hist }), 'forbidden');
await join('H', await invite('D', 'hod', { department: info }));
await join('H2', await invite('AD', 'hod', { department: hist }));
await expectError('the registrar does not invite staff', () => invite('R', 'teacher'), 'forbidden');
await expectError('a head cannot invite into another department', () => invite('H', 'teacher', { department: math }), 'forbidden');
await join('T', await invite('H', 'teacher', { department: info }));
await join('T2', await invite('AD', 'teacher'));
await expectError('a teacher cannot invite anyone', () => invite('T', 'teacher', { department: info }), 'forbidden');
await expectError('students are not invited: they use their matricule', () => invite('AD', 'student'), 'invalid_role');

// --- Courses: created by the admin or the department; teachers assigned ---------------
const algo = (await one('H', `insert into public.courses (institution_id, code, title, department_id) values ($1, 'INF101', 'Algo', $2) returning id`, [inst, info])).id;
check('a head of department creates a course in their department', !!algo);
await expectError('a head cannot create a course in another department',
  () => as('H', `insert into public.courses (institution_id, code, title, department_id) values ($1, 'MAT1', 'x', $2)`, [inst, math]), 'row-level security');
await expectError('a teacher cannot create a course',
  () => as('T', `insert into public.courses (institution_id, code, title, department_id) values ($1, 'X1', 'x', $2)`, [inst, info]), 'row-level security');
const analyse = (await one('AD', `insert into public.courses (institution_id, code, title, department_id) values ($1, 'MAT102', 'Analyse', $2) returning id`, [inst, math])).id;
const histc = (await one('AD', `insert into public.courses (institution_id, code, title, department_id) values ($1, 'HIS100', 'Histoire', $2) returning id`, [inst, hist])).id;

await as('H', `select public.enroll_by_email($1, 't@demo.cm', 'teacher')`, [algo]);
await as('AD', `select public.enroll_by_email($1, 't@demo.cm', 'teacher')`, [analyse]);
await as('AD', `select public.enroll_by_email($1, 't2@demo.cm', 'teacher')`, [analyse]);
check('a teacher teaches several courses', (await count('T', `select count(*) n from public.enrollments where user_id = $1 and role = 'teacher'`, [ids.T])) === 2);
check('a course has several teachers', (await count('AD', `select count(*) n from public.enrollments where course_id = $1 and role = 'teacher'`, [analyse])) === 2);
await expectError('a head cannot staff another department\'s course',
  () => as('H', `select public.enroll_by_email($1, 't2@demo.cm', 'teacher')`, [histc]), 'forbidden');

// --- Students: the list, claims, sign-in ----------------------------------------------
const imp = (await one('R', `select public.import_roster($1, $2::jsonb) as r`, [inst, JSON.stringify([
  { matricule: 'ut21a001', full_name: 'FON Brenda', email: 's1@demo.cm', programme: 'Informatique', level: 'L1', courses: ['INF101', 'MAT102'] },
  { matricule: 'UT21A002', full_name: 'Nkoulou Cédric', courses: ['INF101', 'PHY999'] },
  { matricule: 'UT21A003', full_name: 'Kamga Inès', courses: ['MAT102'] },
])])).r;
check('the registrar imports the student list', imp.created === 3 && imp.course_links === 5);
check('unknown course codes are reported', JSON.stringify(imp.unknown_courses) === '["PHY999"]');
await expectError('a teacher cannot import the list',
  () => as('T', `select public.import_roster($1, '[]'::jsonb)`, [inst]), 'forbidden');

await db.query(`update public.profiles set full_name = 'Brenda Fon' where id = $1`, [ids.S1]);
const c1 = (await one('S1', `select public.claim_matricule('UT', 'UT21A001') as r`)).r;
check('a student claims their matricule', c1.status === 'linked');
check('…and lands in their registered courses',
  (await count('S1', `select count(*) n from public.enrollments where user_id = $1 and role = 'student'`, [ids.S1])) === 2);
check('…as a student of the school', (await one('S1', `select role from public.memberships where user_id = $1`, [ids.S1])).role === 'student');

const c2 = (await one('S2', `select public.claim_matricule('ut', 'UT21A001', 'Brenda Fon') as r`)).r;
check('a taken matricule cannot be claimed again', c2.status === 'taken');
const c3 = (await one('S2', `select public.claim_matricule('ut', 'UT21A003', 'Paul Biya') as r`)).r;
check('the name has to match the list', c3.status === 'name_mismatch');
const c4 = (await one('S2', `select public.claim_matricule('ut', 'UT21A009', 'Yannick Ewane') as r`)).r;
check('a matricule not on the list yet waits', c4.status === 'waiting');
check('…without access to the school meanwhile', (await count('S2', `select count(*) n from public.memberships where user_id = $1`, [ids.S2])) === 0);
const imp2 = (await one('R', `select public.import_roster($1, $2::jsonb) as r`, [inst, JSON.stringify([
  { matricule: 'UT21A009', full_name: 'EWANE Yannick', courses: ['INF101'] },
  { matricule: 'UT21A001', courses: ['HIS100'] },
])])).r;
check('the next import links the waiting student automatically', imp2.claims_linked === 1);
check('…in their courses', (await count('S2', `select count(*) n from public.enrollments where user_id = $1`, [ids.S2])) === 1);
check('re-importing adds courses to linked students', imp2.enrolled === 1
  && (await count('S1', `select count(*) n from public.enrollments where user_id = $1`, [ids.S1])) === 3);
check('re-importing never duplicates', imp2.created === 1 && imp2.updated === 1);

await as('S3', `select public.dispute_matricule('UT', 'UT21A002')`).catch(() => {});
await db.query(`update public.profiles set full_name = 'Cédric Nkoulou' where id = $1`, [ids.Z]);
await as('Z', `select public.claim_matricule('UT', 'UT21A002')`);
await as('S3', `select public.dispute_matricule('UT', 'UT21A002')`);
const claim = (await one('R', `select id from public.matricule_claims where user_id = $1 and status = 'disputed'`, [ids.S3])).id;
check('the registrar sees the disputed claim and who made it',
  !!claim && (await count('R', `select count(*) n from public.profiles where id = $1`, [ids.S3])) === 1);
await expectError('a teacher cannot settle claims', () => as('T', `select public.resolve_claim($1, true)`, [claim]), 'forbidden');
await as('R', `select public.resolve_claim($1, true)`, [claim]);
check('after checking IDs the registrar gives the matricule to the right person',
  (await one('R', `select claimed_by from public.student_roster where upper(matricule) = 'UT21A002'`)).claimed_by === ids.S3
  && (await count('Z', `select count(*) n from public.enrollments where user_id = $1`, [ids.Z])) === 0);

for (let i = 0; i < 10; i++) await as('S2', `select public.claim_matricule('ut', 'NOPE${i}')`);
check('claim attempts are rate limited', (await one('S2', `select public.claim_matricule('ut', 'UT21A003') as r`)).r.status === 'too_many_attempts');

// Matricule sign-in (bcrypt stand-in: crypt(pw, hash) = first 7 chars of hash + md5(pw))
await db.exec(`
  alter table auth.users add column if not exists encrypted_password text;
  create schema if not exists extensions;
  create or replace function extensions.crypt(text, text) returns text language sql as $$ select substr($2, 1, 7) || md5($1) $$;
`);
await db.query(`update auth.users set encrypted_password = '$2a$06$' || md5('Secret123!') where id = $1`, [ids.S1]);
const ok = (await as(null, `select public.login_email('ut21a001', 'Secret123!') as e`, [], 'anon')).rows[0].e;
check('a student signs in with their matricule', ok === 's1@demo.cm');
const bad = (await as(null, `select public.login_email('UT21A001', 'wrong') as e`, [], 'anon')).rows[0].e;
check('a wrong password reveals nothing', bad === null);
for (let i = 0; i < 9; i++) await as(null, `select public.login_email('UT21A001', 'wrong')`, [], 'anon');
await expectError('matricule sign-in is rate limited',
  () => as(null, `select public.login_email('UT21A001', 'Secret123!')`, [], 'anon'), 'too_many_attempts');
await expectError('signed-out visitors cannot read the student list',
  () => as(null, `select count(*) from public.student_roster`, [], 'anon'));

// --- Who sees what --------------------------------------------------------------------
await as('T', `insert into public.assignments (course_id, title, points_possible) values ($1, 'TP 1', 20)`, [algo]);
const tp = (await one('T', `select id from public.assignments where course_id = $1`, [algo])).id;
await as('T', `insert into public.grades (assignment_id, student_id, score) values ($1, $2, 14)`, [tp, ids.S1]);
check('the head of department sees the gradebook of their courses',
  (await count('H', `select count(*) n from public.grades where assignment_id = $1`, [tp])) === 1);
check('the dean sees the courses of their faculty',
  (await count('D', `select count(*) n from public.courses where id in ($1, $2)`, [algo, analyse])) === 2);
check('the dean does not see another faculty', (await count('D', `select count(*) n from public.courses where id = $1`, [histc])) === 0);
check('another head of department sees nothing of it', (await count('H2', `select count(*) n from public.grades where assignment_id = $1`, [tp])) === 0);
await expectError('a head of department cannot change marks',
  () => as('H', `update public.grades set score = 20 where assignment_id = $1 returning id`, [tp]).then((r) => { if (!r.rows.length) throw new Error('no row changed'); }));
await expectError('the admin cannot change marks',
  () => as('AD', `update public.grades set score = 20 where assignment_id = $1 returning id`, [tp]).then((r) => { if (!r.rows.length) throw new Error('no row changed'); }));
check('the registrar can read marks for deliberations', (await count('R', `select count(*) n from public.grades where assignment_id = $1`, [tp])) === 1);
await as('T', `select public.enroll_by_email($1, 's2@demo.cm', 'student')`, [analyse]);
await expectError('a teacher cannot add another teacher', () => as('T', `select public.enroll_by_email($1, 'z@demo.cm', 'teacher')`, [algo]), 'forbidden');

await as('R', `select public.import_roster($1, $2::jsonb)`, [inst, JSON.stringify([{ matricule: 'UT21A004', full_name: 'Atangana Paul', courses: ['HIS100'] }])]);
await db.query(`update public.profiles set full_name = 'Paul Atangana' where id = $1`, [ids.S4]);
check('a history student is linked', (await one('S4', `select public.claim_matricule('UT', 'UT21A004') as r`)).r.status === 'linked');
check('a student does not see students outside their courses',
  (await count('S4', `select count(*) n from public.profiles where id = $1`, [ids.S2])) === 0);
check('a student sees their course mates', (await count('S2', `select count(*) n from public.profiles where id = $1`, [ids.S1])) === 1);
check('a student sees the staff', (await count('S1', `select count(*) n from public.profiles where id in ($1, $2)`, [ids.T, ids.R])) === 2);
check('staff see the students', (await count('T2', `select count(*) n from public.profiles where id = $1`, [ids.S3])) === 1);

// --- Results belong to the registrar ----------------------------------------------------
const prog = (await one('P', `insert into public.programmes (institution_id, department_id, name) values ($1, $2, 'Licence Info') returning id`, [inst, info])).id;
const year = (await one('P', `insert into public.academic_years (institution_id, label, starts_on, ends_on) values ($1, '2026-2027', '2026-10-01', '2027-07-31') returning id`, [inst])).id;
const sem = (await one('P', `insert into public.semesters (institution_id, academic_year_id, label) values ($1, $2, 'S1') returning id`, [inst, year])).id;
await expectError('the admin cannot run deliberations',
  () => as('AD', `insert into public.deliberations (programme_id, semester_id, level) values ($1, $2, 'L1')`, [prog, sem]), 'row-level security');
const delib = (await one('R', `insert into public.deliberations (programme_id, semester_id, level) values ($1, $2, 'L1') returning id`, [prog, sem])).id;
check('the registrar runs deliberations', !!delib);
await as('R', `update public.deliberations set status = 'locked' where id = $1`, [delib]);
await expectError('only the owner reopens a locked deliberation',
  () => as('R', `update public.deliberations set status = 'draft' where id = $1`, [delib]), 'forbidden');
await as('O', `update public.deliberations set status = 'draft' where id = $1`, [delib]);
check('the owner can reopen it', (await one('O', `select status from public.deliberations where id = $1`, [delib])).status === 'draft');
check('the dean can read deliberations', (await count('D', `select count(*) n from public.deliberations where id = $1`, [delib])) === 1);

// --- The course list comes from the registrar's file; lecturers add what they teach -------
const coursesBefore = await count('R', `select count(*) n from public.courses where institution_id = $1`, [inst]);
const s1Mat = (await one('S1', `select matricule from public.student_roster where claimed_by = $1`, [ids.S1])).matricule;
const imp3 = (await one('R', `select public.import_roster($1, $2::jsonb, $3, $4::jsonb) as r`, [inst,
  JSON.stringify([{ matricule: s1Mat, courses: ['HIS 201', 'INF202'] }]), sem,
  JSON.stringify([{ code: 'his201', title: 'Histoire du Cameroun', department: 'Histoire' }, { code: 'INF202', title: 'Bases de données' }, { code: 'X1', title: '' }])])).r;
check('courses named in the file are created, in that semester', imp3.courses_created === 2
  && (await count('R', `select count(*) n from public.courses where institution_id = $1`, [inst])) === coursesBefore + 2
  && (await count('R', `select count(*) n from public.courses where code = 'HIS201' and semester_id = $1`, [sem])) === 1);
check('the file\'s department is kept', (await count('R', `select count(*) n from public.courses where code = 'HIS201' and department_id = $1`, [hist])) === 1);
check('a registered student lands in them straight away',
  (await count('S1', `select count(*) n from public.enrollments e join public.courses c on c.id = e.course_id where e.user_id = $1 and c.code in ('HIS201', 'INF202')`, [ids.S1])) === 2);
const imp4 = (await one('R', `select public.import_roster($1, '[]'::jsonb, $2, $3::jsonb) as r`, [inst, sem,
  JSON.stringify([{ code: 'HIS201', title: 'Histoire du Cameroun' }])])).r;
check('importing again creates no duplicate course', imp4.courses_created === 0);
check('course codes are written one way ("HIS 201" is HIS201)', (await count('R', `select count(*) n from public.courses where code = 'HIS201'`)) === 1);
await expectError('a course code exists once per semester',
  () => as('AD', `insert into public.courses (institution_id, code, title, semester_id) values ($1, 'his201', 'Copy', $2)`, [inst, sem]), 'duplicate key');
const his = (await one('R', `select id from public.courses where code = 'HIS201'`)).id;
check('lecturers see the semester\'s courses and can search them', (await count('T2', `select count(*) n from public.course_catalogue('cameroun')`)) === 1
  && (await count('T2', `select count(*) n from public.course_catalogue('')`)) >= 3);
check('students do not', (await count('S1', `select count(*) n from public.course_catalogue('')`)) === 0);
await as('T2', `select public.teach_course($1)`, [his]);
await as('T', `select public.teach_course($1)`, [his]);
await as('T', `select public.teach_course($1)`, [his]);
check('two lecturers, one course', (await count('R', `select count(*) n from public.enrollments where course_id = $1 and role = 'teacher'`, [his])) === 2
  && (await count('R', `select count(*) n from public.courses where code = 'HIS201'`)) === 1);
check('the course shows on their dashboard', (await count('T', `select count(*) n from public.courses where id = $1`, [his])) === 1);
check('the head of the department is told who joined', (await count('H2', `select count(*) n from public.notifications where kind = 'teaching' and course_id = $1`, [his])) === 2);
check('the other lecturer is told too', (await count('T2', `select count(*) n from public.notifications where kind = 'teaching' and course_id = $1`, [his])) === 1);
await expectError('a student cannot make themselves the lecturer', () => as('S1', `select public.teach_course($1)`, [his]), 'forbidden');
await expectError('an outsider cannot either', () => as('Z', `select public.teach_course($1)`, [his]), 'forbidden');
await as('T2', `select public.leave_course($1)`, [his]);
check('a lecturer can leave a course', (await count('R', `select count(*) n from public.enrollments where course_id = $1 and role = 'teacher'`, [his])) === 1);

// --- The Ardoise team account is the master view, never a member of a school -------------
await expectError('the Ardoise team account cannot join a school', async () => as('P', `select public.accept_invitation($1)`, [await invite('O', 'teacher')]), 'platform_account');
await expectError('a school member cannot be made an Ardoise team account',
  () => db.query('insert into public.platform_admins (user_id) values ($1)', [ids.O]), 'platform_account');
const schools = (await as('P', `select * from public.platform_schools()`)).rows;
const ut = schools.find((x) => x.slug === 'ut');
check('the master dashboard sees every school with its numbers',
  !!ut && ut.students_listed >= 4 && ut.students_joined >= 4 && ut.staff >= 5 && ut.users === ut.students_joined + ut.staff && ut.open_requests === 2);
await expectError('a school owner cannot see the master numbers', () => as('O', `select * from public.platform_schools()`), 'forbidden');
const office = (await as('P', `select * from public.platform_school_people($1)`, [inst])).rows;
check('the master dashboard shows who runs a school', office[0]?.role === 'owner' && office.some((x) => x.role === 'registrar'));
await expectError('nobody else can list them', () => as('AD', `select * from public.platform_school_people($1)`, [inst]), 'forbidden');
const regs = (await as('T', `select * from public.course_registrations($1)`, [his])).rows;
check('a lecturer sees the course\'s registered students with their matricule', regs.some((x) => x.matricule === s1Mat && x.user_id === ids.S1));
await expectError('a student cannot list them', () => as('S1', `select * from public.course_registrations($1)`, [his]), 'forbidden');

// --- Roles can be taken back, but never the last owner ------------------------------------
const hodRow = (await one('D', `select id from public.memberships where user_id = $1 and role = 'hod'`, [ids.H])).id;
await as('D', `select public.revoke_role($1)`, [hodRow]);
check('a dean removes a head of department in their faculty', (await count('AD', `select count(*) n from public.memberships where id = $1`, [hodRow])) === 0);
const ownerRow = (await one('O', `select id from public.memberships where user_id = $1 and role = 'owner'`, [ids.O])).id;
await expectError('the admin cannot remove the owner', () => as('AD', `select public.revoke_role($1)`, [ownerRow]), 'forbidden');
await expectError('the last owner cannot be removed', () => as('O', `select public.revoke_role($1)`, [ownerRow]), 'last_owner');
await expectError('nobody writes memberships directly',
  () => as('AD', `insert into public.memberships (institution_id, user_id, role) values ($1, $2, 'admin')`, [inst, ids.Z]), 'row-level security');

// --- Programme and level straight from the registrar's file -------------------------------
await as('R', `select public.import_roster($1, $2::jsonb, $3, $4::jsonb)`, [inst,
  JSON.stringify([{ matricule: s1Mat, programme: 'LMATH', level: 'L1' }]), sem,
  JSON.stringify([{ code: 'MAT 301', title: 'Algèbre', department: 'Mathématiques', faculty: 'FS', level: 'L3' }])]);
check('a student on the list is in their programme and level for the year, without anyone registering them',
  (await count('R', `select count(*) n from public.programme_enrollments pe join public.programmes p on p.id = pe.programme_id where p.code = 'LMATH' and pe.student_id = $1 and pe.level = 'L1'`, [ids.S1])) === 1);
check('a courses file carries the department (settled by faculty) and level',
  (await count('R', `select count(*) n from public.courses where code = 'MAT301' and department_id = $1 and level = 'L3'`, [math])) === 1);
await as('R', `select public.import_roster($1, '[]'::jsonb, $2, $3::jsonb)`, [inst, sem, JSON.stringify([{ code: 'HIS201', department: 'Histoire', level: 'L2' }])]);
check('a later file fills in what an earlier one left out', (await count('R', `select count(*) n from public.courses where code = 'HIS201' and level = 'L2'`)) === 1);

// --- Searched, paged lists for administrators ------------------------------------------------
const page1 = (await as('R', `select * from public.admin_courses($1, 'his', null, 0, 1)`, [inst])).rows;
check('the course list is searched and paged, with its total', page1.length === 1 && Number(page1[0].total) === 2);
const byDept = (await as('R', `select * from public.admin_courses($1, '', $2)`, [inst, math])).rows;
check('…and filtered by department', byDept.length >= 1 && byDept.every((c) => c.department === 'Mathématiques'));
await expectError('a lecturer cannot list every course', () => as('T', `select * from public.admin_courses($1)`, [inst]), 'forbidden');
const staffPage = (await as('AD', `select * from public.admin_staff($1, '', 'teacher', 0, 50)`, [inst])).rows;
check('the staff list is filtered by role, one entry per person with all their roles',
  staffPage.length >= 2 && staffPage.every((p) => p.roles.some((r) => r.role === 'teacher')));
await expectError('students cannot list the staff', () => as('S1', `select * from public.admin_staff($1)`, [inst]), 'forbidden');

// --- The Ardoise team: its owner invites assistants with their own login ------------------
const teamTok = (await one('P', `select public.create_team_invitation('', 'Assistant') as t`)).t;
check('the team owner creates a link for an assistant', typeof teamTok === 'string' && teamTok.length >= 60);
check('anyone with the link sees what it is', (await as(null, `select public.team_invitation_preview($1) as p`, [teamTok], 'anon')).rows[0].p.status === 'open');
await expectError('a school member cannot use it', () => as('O', `select public.accept_team_invitation($1)`, [teamTok]), 'school_account');
await as('Z', `select public.accept_team_invitation($1)`, [teamTok]);
check('the assistant is on the team with their own login', (await count('Z', `select count(*) n from public.platform_team()`)) === 2
  && (await one('Z', `select role from public.platform_team() where user_id = $1`, [ids.Z])).role === 'member');
check('the assistant sees every school', (await count('Z', `select count(*) n from public.platform_schools()`)) >= 1);
await expectError('an assistant cannot invite more people', () => as('Z', `select public.create_team_invitation('', 'X')`), 'forbidden');
await expectError('an assistant cannot remove the owner', () => as('Z', `select public.remove_teammate($1)`, [ids.P]), 'forbidden');
await as('P', `select public.remove_teammate($1)`, [ids.Z]);
check('the owner removes an assistant', (await count('P', `select count(*) n from public.platform_team()`)) === 1);
await expectError('a removed assistant sees nothing', () => as('Z', `select * from public.platform_schools()`), 'forbidden');

// --- The team's hierarchy -----------------------------------------------------------------
const tokQ1 = (await one('P', `select public.create_team_invitation('', 'Leticia', 'Operations') as t`)).t;
const pendingQ1 = await one('P', `select title, reports_to from public.platform_invitations where token = $1`, [tokQ1]);
check('someone invited already has their place: a title, under the owner', pendingQ1.title === 'Operations' && pendingQ1.reports_to === ids.P);
await as('Q1', `select public.accept_team_invitation($1)`, [tokQ1]);
const q1 = await one('P', `select title, reports_to from public.platform_team() where user_id = $1`, [ids.Q1]);
check('joining keeps the title and the manager', q1.title === 'Operations' && q1.reports_to === ids.P);
const tokQ2 = (await one('P', `select public.create_team_invitation('', 'Sales rep', 'Sales', $1) as t`, [ids.Q1])).t;
await as('Q2', `select public.accept_team_invitation($1)`, [tokQ2]);
check('the owner can place a new teammate under someone else',
  (await one('P', `select reports_to from public.platform_team() where user_id = $1`, [ids.Q2])).reports_to === ids.Q1);
await expectError('nobody reports to someone below them', () => as('P', `select public.update_teammate($1, 'Ops', $2)`, [ids.Q1, ids.Q2]), 'invalid');
await expectError('nobody reports to someone outside the team', () => as('P', `select public.update_teammate($1, 'Ops', $2)`, [ids.Q1, ids.Z]), 'invalid');
await expectError('only the owner arranges the team', () => as('Q1', `select public.update_teammate($1, 'Boss', $2)`, [ids.Q2, ids.P]), 'forbidden');
await as('P', `select public.update_teammate($1, 'Founder', $2)`, [ids.P, ids.Q1]);
const me = await one('P', `select title, reports_to from public.platform_team() where user_id = $1`, [ids.P]);
check('the owner gets a title and reports to no one', me.title === 'Founder' && me.reports_to === null);

// --- Messages between teammates -------------------------------------------------------------
await as('P', `select public.team_send(null, 'Welcome to the team!')`);
await as('Q1', `select public.team_send($1, 'Can you call UBa tomorrow?')`, [ids.Q2]);
check('everyone on the team reads the team conversation',
  (await count('Q2', `select count(*) n from public.team_messages m join public.team_threads t on t.id = m.thread_id where t.key = 'team'`)) === 1);
check('a one-to-one conversation is read by its two people', (await count('Q2', `select count(*) n from public.team_messages`)) === 2);
check('…and by nobody else, not even the owner', (await count('P', `select count(*) n from public.team_messages`)) === 1);
const q2inbox = (await as('Q2', `select * from public.team_inbox()`)).rows;
check('each conversation shows who it is with and what is unread',
  q2inbox.length === 2 && q2inbox.find((r) => r.peer === ids.Q1)?.unread === 1 && q2inbox.find((r) => r.peer === null)?.unread === 1);
check('the sidebar badge counts conversations with something new', (await one('Q2', `select public.team_unread_count() as n`)).n === 2);
check('your own message is not unread for you',
  (await as('Q1', `select * from public.team_inbox()`)).rows.find((r) => r.peer === ids.Q2)?.unread === 0);
await as('Q2', `select public.team_mark_read($1)`, [ids.Q1]);
check('opening a conversation marks it read', (await one('Q2', `select public.team_unread_count() as n`)).n === 1);
await expectError('people outside the team cannot write to it', () => as('Z', `select public.team_send(null, 'hi')`), 'forbidden');
await expectError('…nor to a teammate', () => as('O', `select public.team_send($1, 'hi')`, [ids.P]), 'forbidden');
await expectError('a teammate cannot write to an outsider', () => as('Q1', `select public.team_send($1, 'hi')`, [ids.Z]), 'forbidden');
await expectError('an empty message is refused', () => as('Q1', `select public.team_send(null, '   ')`), 'invalid');
check('outsiders read nothing', (await count('Z', `select count(*) n from public.team_messages`)) === 0);
await expectError('messages only go through team_send',
  () => as('Q1', `insert into public.team_messages (thread_id, body) select id, 'x' from public.team_threads limit 1`), 'permission denied');

await as('P', `select public.remove_teammate($1)`, [ids.Q1]);
check('removing a manager moves their people up a level',
  (await one('P', `select reports_to from public.platform_team() where user_id = $1`, [ids.Q2])).reports_to === ids.P);
check('a removed teammate reads no team messages', (await count('Q1', `select count(*) n from public.team_messages`)) === 0);

// --- Prospects: the university's own administrators cannot open or close it ------------------
await expectError('a university administrator cannot change whether it is open',
  () => as('AD', `update public.institutions set status = 'prospect' where id = $1`, [inst]), 'forbidden');
await expectError('…nor mark its structure as checked',
  () => as('AD', `update public.institutions set structure_confirmed_at = now() where id = $1`, [inst]), 'forbidden');
await as('AD', `update public.institutions set name = 'Université Test' where id = $1`, [inst]);
check('…but still edits its name and settings', (await one('P', `select status from public.institutions where id = $1`, [inst])).status === 'live');
await expectError('only the Ardoise team marks a structure checked', () => as('AD', `select public.set_structure_confirmed($1, true)`, [inst]), 'forbidden');
await as('P', `select public.set_structure_confirmed($1, false)`, [inst]);
const card = (await as('P', `select * from public.platform_schools() where id = $1`, [inst])).rows[0];
check('the master dashboard shows status, whether the structure is checked, and its size',
  card.status === 'live' && card.structure_confirmed_at === null && card.faculties >= 1 && card.departments >= 1);
await as('P', `select public.set_structure_confirmed($1, true)`, [inst]);

// --- A university’s look, and links the Ardoise team sends to its people -------------------
const regToken = (await one('P', `select public.platform_invite($1, 'registrar', 'reg@demo.cm', 'Registrar Person') as t`, [inst])).t;
check('the Ardoise team sends a link to a university’s registrar', typeof regToken === 'string' && regToken.length >= 60);
await expectError('a university administrator cannot use the Ardoise team’s invite',
  () => as('AD', `select public.platform_invite($1, 'owner')`, [inst]), 'forbidden');
await expectError('the Ardoise team only invites heads, administrators and registrars',
  () => as('P', `select public.platform_invite($1, 'teacher')`, [inst]), 'invalid');
const regInv = (await one('Q2', `select id from public.invitations where token = $1`, [regToken]))?.id;
check('every teammate sees the links sent to universities', !!regInv);
await as('Q2', `select public.revoke_invitation($1)`, [regInv]);
check('…and a teammate can withdraw one', (await as(null, `select public.invitation_preview($1) as p`, [regToken], 'anon')).rows[0].p.status === 'revoked');

await as('AD', `select public.set_school_profile($1, 'UT', '#1f5c4a', 'Buea', 'https://ut.example.cm')`, [inst]);
const look = await one('P', `select short_name, brand_color, city, website from public.institutions where id = $1`, [inst]);
check('a university’s administrator sets its short name, colour, city and website',
  look.short_name === 'UT' && look.brand_color === '#1f5c4a' && look.city === 'Buea' && look.website === 'https://ut.example.cm');
await expectError('a teacher cannot change the university’s look',
  () => as('T', `select public.set_school_profile($1, 'X', '', '', '')`, [inst]), 'forbidden');
await expectError('a colour must be a #rrggbb colour', () => as('AD', `select public.set_school_profile($1, 'UT', 'red', '', '')`, [inst]));
await expectError('a website must be a web address', () => as('AD', `select public.set_school_profile($1, 'UT', '', '', 'javascript:alert(1)')`, [inst]));
await as('AD', `insert into storage.objects (bucket_id, name) values ('brand', $1)`, [`${inst}/logo-1.png`]);
await as('AD', `select public.set_school_logo($1, $2)`, [inst, `${inst}/logo-1.png`]);
check('…and uploads its logo', (await one('P', `select logo_path from public.institutions where id = $1`, [inst])).logo_path === `${inst}/logo-1.png`);
await expectError('a logo must sit in the university’s own folder',
  () => as('AD', `select public.set_school_logo($1, 'someone-else/logo.png')`, [inst]), 'invalid');
await expectError('nobody uploads into another university’s folder',
  () => as('Z', `insert into storage.objects (bucket_id, name) values ('brand', $1)`, [`${inst}/logo-2.png`]));
await as('P', `select public.set_school_profile($1, 'UT', '#1f5c4a', 'Buea', '')`, [inst]);
check('the Ardoise team can set it too', (await one('P', `select website from public.institutions where id = $1`, [inst])).website === '');
check('the join page shows the university’s look',
  (await as(null, `select public.invitation_preview($1) as p`, [regToken], 'anon')).rows[0].p.logo_path === `${inst}/logo-1.png`);
check('the master dashboard carries it', (await one('P', `select short_name, logo_path from public.platform_schools() where id = $1`, [inst])).short_name === 'UT');

// --- Two-step login, enforced by the database ------------------------------------------------
const status = async (user) => (await one(user, `select public.account_status() as s`)).s;
const tTeaches = await count('T', `select count(*) n from public.enrollments where user_id = $1`, [ids.T]);
const tCourse = (await one('T', `select course_id from public.enrollments where user_id = $1 and role = 'teacher' limit 1`, [ids.T])).course_id;
setAal('aal1'); // password only, no code entered
check('a teacher without two-step login works as before',
  tTeaches > 0 && (await count('T', `select count(*) n from public.enrollments where user_id = $1`, [ids.T])) === tTeaches);
const adStatus = await status('AD');
check('an administrator must turn two-step login on', adStatus.mfa_required === true && adStatus.has_mfa === false && adStatus.aal === 'aal1');
check('…and until then the database gives them nothing',
  (await count('AD', `select count(*) n from public.memberships where institution_id = $1`, [inst])) === 0);
await expectError('…not even through a function', () => as('AD', `select * from public.admin_staff($1)`, [inst]), 'forbidden');
check('so does a registrar', (await status('R')).mfa_required === true);
await expectError('the Ardoise team needs it too', () => as('P', `select * from public.platform_schools()`), 'forbidden');
check('a student does not have to', (await status('S1')).mfa_required === false);

await db.query(`insert into auth.mfa_factors (user_id, status) values ($1, 'verified')`, [ids.T]);
const tStatus = await status('T');
check('someone who turned it on is told to enter their code', tStatus.has_mfa === true && tStatus.aal === 'aal1');
check('…and with the password alone reads nothing', (await count('T', `select count(*) n from public.enrollments`)) === 0);
await expectError('…and changes nothing',
  () => as('T', `insert into public.announcements (course_id, author_id, title, body) values ($1, $2, 'x', 'x')`, [tCourse, ids.T]),
  'row-level security');
setAal('aal2');
check('with the code entered, everything is back', (await count('T', `select count(*) n from public.enrollments where user_id = $1`, [ids.T])) === tTeaches);
check('an administrator who entered their code works', (await count('AD', `select count(*) n from public.memberships where institution_id = $1`, [inst])) > 0);
await db.query(`delete from auth.mfa_factors where user_id = $1`, [ids.T]);

setAal('aal1');
await db.query(`update auth.users set email = 'r@demo.ardoise.cm' where id = $1`, [ids.R]);
check('demo accounts (shared presentation passwords) are exempt', (await status('R')).mfa_required === false
  && (await count('R', `select count(*) n from public.memberships where institution_id = $1`, [inst])) > 0);
await db.query(`update auth.users set email = 'r@demo.cm' where id = $1`, [ids.R]);
check('signed-out visitors still find their university', (await as(null, `select count(*) n from public.school_directory()`, [], 'anon')).rows[0].n > 0);
setAal('aal2');

const unguarded = (await db.query(`
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname
                    and p.policyname = 'two_step' and p.permissive = 'RESTRICTIVE')`)).rows.map((r) => r.relname);
check(`every table requires two-step login where it is on${unguarded.length ? ` (missing: ${unguarded.join(', ')})` : ''}`, unguarded.length === 0);

done();
