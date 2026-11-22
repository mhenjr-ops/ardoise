// Runs supabase/seed/uba.sql (the University of Bamenda's structure) twice.
import { readFileSync } from 'node:fs';
import { setup } from './harness.mjs';

const { db, check, done } = await setup([]);
const seed = readFileSync(new URL('../seed/uba.sql', import.meta.url), 'utf8');
await db.exec(seed);
const n = async (sql) => Number((await db.query(sql)).rows[0].n);
const inst = `(select id from public.institutions where slug = 'uba')`;
check('13 faculties, schools and institutes', (await n(`select count(*) n from public.faculties where institution_id = ${inst}`)) === 13);
check('6 faculties and 7 schools', (await n(`select count(*) n from public.faculties where institution_id = ${inst} and kind = 'school'`)) === 7);
check('64 departments, all attached', (await n(`select count(*) n from public.departments where institution_id = ${inst} and faculty_id is not null`)) === 64);
check('34 programmes, 17 of them HND', (await n(`select count(*) n from public.programmes where institution_id = ${inst}`)) === 34
  && (await n(`select count(*) n from public.programmes where institution_id = ${inst} and cycle = 'hnd'`)) === 17);
check('same-named departments stay in their own school',
  (await n(`select count(*) n from public.departments d join public.faculties f on f.id = d.faculty_id where d.name = 'Computer Engineering'`)) === 2);
check('the current year has two semesters', (await n(`select count(*) n from public.semesters s join public.academic_years y on y.id = s.academic_year_id where y.is_current`)) === 2);
await db.exec(seed);
check('running it again adds nothing',
  (await n(`select count(*) n from public.departments where institution_id = ${inst}`)) === 64
  && (await n(`select count(*) n from public.programmes where institution_id = ${inst}`)) === 34
  && (await n(`select count(*) n from public.semesters`)) === 2);

// Presentation accounts on top (needs the auth stand-in the demo seed uses).
await db.exec(`
  alter table auth.users
    add column instance_id uuid, add column aud text, add column role text,
    add column encrypted_password text, add column email_confirmed_at timestamptz,
    add column raw_app_meta_data jsonb, add column created_at timestamptz, add column updated_at timestamptz,
    add column confirmation_token text, add column recovery_token text, add column email_change_token_new text,
    add column email_change text, add column email_change_token_current text, add column phone_change_token text,
    add column reauthentication_token text;
  create table auth.identities (id uuid primary key, user_id uuid references auth.users(id), provider_id text,
    identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
  create schema extensions;
  create function extensions.gen_salt(text) returns text language sql as $$ select '$2a$06$stub' $$;
  create function extensions.crypt(text, text) returns text language sql as $$ select $2 || md5($1) $$;
`);
const demo = readFileSync(new URL('../seed/uba-demo.sql', import.meta.url), 'utf8');
let refused = false;
try { await db.exec(demo); } catch (e) { refused = /password/i.test(String(e.message)); }
check('the presentation seed refuses to run without a password', refused);
await db.exec(`select set_config('ardoise.demo_password', 'Test-Pass-1234', false)`);
await db.exec(demo);
const uid = async (email) => (await db.query('select id from auth.users where email = $1', [email])).rows[0]?.id;
const divine = await uid('d.ngwa@demo.ardoise.cm');
const nfor = await uid('p.nfor@demo.ardoise.cm');
check('17 accounts: 5 lecturers and 12 students', (await n(`select count(*) n from auth.users`)) === 17);
check('the two sign-in accounts share the given password, the rest do not',
  (await n(`select count(*) n from auth.users where encrypted_password = '$2a$06$stub' || md5('Test-Pass-1234')`)) === 2);
check('Divine has a full load: 7 courses', (await n(`select count(*) n from public.enrollments where user_id = '${divine}' and role = 'student'`)) === 7);
check('Dr Nfor teaches 4 courses in 3 departments of 3 faculties and schools',
  (await n(`select count(*) n from public.enrollments where user_id = '${nfor}' and role = 'teacher'`)) === 4
  && (await n(`select count(distinct c.department_id) n from public.enrollments e join public.courses c on c.id = e.course_id where e.user_id = '${nfor}' and e.role = 'teacher'`)) === 3
  && (await n(`select count(distinct d.faculty_id) n from public.enrollments e join public.courses c on c.id = e.course_id join public.departments d on d.id = c.department_id where e.user_id = '${nfor}' and e.role = 'teacher'`)) === 3);
check('CEC203 sits in the Polytechnic, not the College of Technology',
  (await n(`select count(*) n from public.courses c join public.departments d on d.id = c.department_id join public.faculties f on f.id = d.faculty_id where c.code = 'CEC203' and f.code = 'NAHPI'`)) === 1);
check('Divine signs in with his matricule (on the list, linked)', (await n(`select count(*) n from public.student_roster where matricule = 'UBA25S0217' and claimed_by = '${divine}'`)) === 1);
check('three classmates are on the list but have not signed up', (await n(`select count(*) n from public.student_roster where claimed_by is null`)) === 3);
check('their registrations wait for them', (await n(`select count(*) n from public.roster_courses rc join public.student_roster s on s.id = rc.roster_id where s.claimed_by is null`)) === 21);
check('a weekly timetable and the exam period', (await n(`select count(*) n from public.calendar_events where kind = 'class'`)) === 10
  && (await n(`select count(*) n from public.calendar_events where kind = 'exam'`)) === 1);
check('Divine has work due', (await n(`select count(*) n from public.assignments a join public.enrollments e on e.course_id = a.course_id where e.user_id = '${divine}' and a.due_at > now()`)) === 3);
await db.exec(demo);
check('running it again adds nothing', (await n(`select count(*) n from auth.users`)) === 17);
done();
