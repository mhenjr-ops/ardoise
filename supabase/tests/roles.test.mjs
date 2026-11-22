// Roles and joining: schools created by the platform, invitations, scoped powers,
// oversight, the student list, matricule claims and matricule sign-in.
import { setup } from './harness.mjs';

const { db, ids, as, check, expectError, done } = await setup([
  'P', 'O', 'AD', 'R', 'D', 'H', 'H2', 'T', 'T2', 'S1', 'S2', 'S3', 'S4', 'Z',
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

// --- Roles can be taken back, but never the last owner ------------------------------------
const hodRow = (await one('D', `select id from public.memberships where user_id = $1 and role = 'hod'`, [ids.H])).id;
await as('D', `select public.revoke_role($1)`, [hodRow]);
check('a dean removes a head of department in their faculty', (await count('AD', `select count(*) n from public.memberships where id = $1`, [hodRow])) === 0);
const ownerRow = (await one('O', `select id from public.memberships where user_id = $1 and role = 'owner'`, [ids.O])).id;
await expectError('the admin cannot remove the owner', () => as('AD', `select public.revoke_role($1)`, [ownerRow]), 'forbidden');
await expectError('the last owner cannot be removed', () => as('O', `select public.revoke_role($1)`, [ownerRow]), 'last_owner');
await expectError('nobody writes memberships directly',
  () => as('AD', `insert into public.memberships (institution_id, user_id, role) values ($1, $2, 'admin')`, [inst, ids.Z]), 'row-level security');

done();
