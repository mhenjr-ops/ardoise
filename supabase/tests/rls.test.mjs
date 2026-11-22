import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

import { readdirSync } from 'node:fs';
const migrationsDir = new URL('../migrations/', import.meta.url);
const migration = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => readFileSync(new URL(f, migrationsDir), 'utf8')).join('\n');
const db = new PGlite();

const stub = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to authenticated;
grant all on storage.objects to authenticated;
grant execute on function storage.foldername(text) to authenticated;
`;

await db.exec(stub);
try { await db.exec(migration); } catch (e) { console.log("MIGRATION ERROR:", e.message, e.where || "", e.position || ""); process.exit(1); }
console.log('migration applied');

const ids = {
  A: '00000000-0000-0000-0000-00000000000a',
  T: '00000000-0000-0000-0000-00000000000b',
  S1: '00000000-0000-0000-0000-00000000000c',
  S2: '00000000-0000-0000-0000-00000000000d',
  X: '00000000-0000-0000-0000-00000000000e',
};
for (const [k, id] of Object.entries(ids)) {
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id, `${k.toLowerCase()}@demo.cm`, JSON.stringify({ full_name: `User ${k}`, locale: k === 'X' ? 'en' : 'fr' }),
  ]);
}

async function as(user, sql, params = []) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ? ids[user] : '']);
  await db.exec('set role authenticated');
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
  }
}
async function createSchool(user, name, slug) {
  await db.query('insert into public.platform_admins (user_id) values ($1) on conflict do nothing', [ids[user]]);
  let id;
  try {
    id = (await as(user, 'select public.create_institution($1, $2) as id', [name, slug])).rows[0].id;
  } finally {
    await db.query('delete from public.platform_admins where user_id = $1', [ids[user]]);
  }
  await db.query(`insert into public.memberships (institution_id, user_id, role) values ($1, $2, 'owner')`, [id, ids[user]]);
  return id;
}
let failures = 0;
function check(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
}
async function expectError(label, fn) {
  try {
    await fn();
    check(label + ' (expected error)', false);
  } catch (e) {
    check(`${label} -> ${e.message.split('\n')[0]}`, true);
  }
}

try {
const profiles = await db.query('select count(*)::int n from public.profiles');
check('profiles auto-created', profiles.rows[0].n === 5);

const inst = await createSchool('A', 'Institut Démo', 'demo');
check('A creates institution', !!inst);
await as('A', `select public.add_member_by_email($1, 't@demo.cm', 'teacher')`, [inst]);
await as('A', `select public.add_member_by_email($1, 's1@demo.cm', 'student')`, [inst]);
await expectError('teacher cannot add members', () => as('T', `select public.add_member_by_email($1, 's2@demo.cm', 'student')`, [inst]));

await expectError('a teacher cannot create a course', () => as('T', `insert into public.courses (institution_id, code, title) values ($1, 'NOPE', 'x')`, [inst]));
const course = (await as('A', `insert into public.courses (institution_id, code, title) values ($1, 'INF101', 'Algorithmique') returning id`, [inst])).rows[0].id;
await as('A', `select public.enroll_by_email($1, 't@demo.cm', 'teacher')`, [course]);
const tEnroll = await as('T', `select role from public.enrollments where course_id = $1 and user_id = $2`, [course, ids.T]);
check('the school assigns the teacher to the course', tEnroll.rows[0]?.role === 'teacher');

await as('T', `select public.enroll_by_email($1, 's1@demo.cm', 'student')`, [course]);
const mod = (await as('T', `insert into public.modules (course_id, title, position) values ($1, 'Semaine 1', 1) returning id, institution_id`, [course])).rows[0];
check('module scoped to institution by trigger', mod.institution_id === inst);
const page = (await as('T', `insert into public.pages (course_id, title, body) values ($1, 'Introduction', 'Bienvenue') returning id`, [course])).rows[0].id;
const asg = (await as('T', `insert into public.assignments (course_id, title, points_possible, component) values ($1, 'TP 1', 20, 'tp') returning id`, [course])).rows[0].id;
await as('T', `insert into public.module_items (module_id, item_type, title, page_id, position) values ($1, 'page', 'Introduction', $2, 1)`, [mod.id, page]);
await as('T', `insert into public.module_items (module_id, item_type, title, assignment_id, position) values ($1, 'assignment', 'TP 1', $2, 2)`, [mod.id, asg]);
await as('T', `insert into public.announcements (course_id, title, body, author_id) values ($1, 'Bienvenue', 'Premier cours lundi', $2)`, [course, ids.T]);
const hiddenPage = (await as('T', `insert into public.pages (course_id, title, published) values ($1, 'Brouillon', false) returning id`, [course])).rows[0].id;

const s1Courses = await as('S1', `select id from public.courses`);
check('S1 sees 1 course', s1Courses.rows.length === 1);
const s1Pages = await as('S1', `select id from public.pages`);
check('S1 sees only published page', s1Pages.rows.length === 1 && s1Pages.rows[0].id === page);
const s1Items = await as('S1', `select id from public.module_items`);
check('S1 sees 2 module items', s1Items.rows.length === 2);
const s1Ann = await as('S1', `select id from public.announcements`);
check('S1 sees announcement', s1Ann.rows.length === 1);
const s1Peers = await as('S1', `select id from public.profiles`);
check('S1 sees profiles in same institution only', s1Peers.rows.length === 3);

const sub = (await as('S1', `insert into public.submissions (assignment_id, student_id, body) values ($1, $2, 'Ma réponse') returning course_id, institution_id`, [asg, ids.S1])).rows[0];
check('submission scoped by trigger', sub.course_id === course && sub.institution_id === inst);
await as('S1', `update public.submissions set body = 'Réponse v2' where assignment_id = $1`, [asg]);

const s2Courses = await as('S2', `select id from public.courses`);
check('S2 (not enrolled, no membership) sees 0 courses', s2Courses.rows.length === 0);
await expectError('S2 cannot submit', () => as('S2', `insert into public.submissions (assignment_id, student_id, body) values ($1, $2, 'x')`, [asg, ids.S2]));
await expectError('S1 cannot submit as S2', () => as('S1', `insert into public.submissions (assignment_id, student_id, body) values ($1, $2, 'x')`, [asg, ids.S2]));

await as('T', `insert into public.grades (assignment_id, student_id, score, comment) values ($1, $2, 14.5, 'Bien')`, [asg, ids.S1]);
await as('T', `update public.grades set score = 15 where assignment_id = $1 and student_id = $2`, [asg, ids.S1]);
const audit = await as('T', `select old_score, new_score, changed_by from public.mark_audit_log order by id`);
check('audit log has 2 rows', audit.rows.length === 2 && Number(audit.rows[1].old_score) === 14.5 && audit.rows[1].changed_by === ids.T);
const s1Grades = await as('S1', `select score from public.grades`);
check('S1 sees own grade', s1Grades.rows.length === 1 && Number(s1Grades.rows[0].score) === 15);
await expectError('S1 cannot write grades', async () => {
  const r = await as('S1', `update public.grades set score = 20 where student_id = $1 returning id`, [ids.S1]);
  if (r.rows.length === 0) throw new Error('no rows updated (blocked by RLS)');
});
const s1Audit = await as('S1', `select id from public.mark_audit_log`);
check('S1 cannot read audit log', s1Audit.rows.length === 0);

// Cross-tenant isolation
const instX = await createSchool('X', 'Other School', 'other');
check('X creates own institution', !!instX);
const xCourses = await as('X', `select id from public.courses`);
check('X sees 0 courses of demo', xCourses.rows.length === 0);
await expectError('X cannot create course in demo', () => as('X', `insert into public.courses (institution_id, code, title) values ($1, 'HACK', 'x')`, [inst]));
const xProfiles = await as('X', `select id from public.profiles`);
check('X sees only own profile', xProfiles.rows.length === 1);
await expectError('X cannot enroll into demo course', () => as('X', `select public.enroll_by_email($1, 'x@demo.cm', 'student')`, [course]));
const xInst = await as('X', `select id from public.institutions`);
check('X sees only own institution', xInst.rows.length === 1 && xInst.rows[0].id === instX);

// Module item cannot point at another course's page
const course2 = (await as('A', `insert into public.courses (institution_id, code, title) values ($1, 'MAT102', 'Analyse') returning id`, [inst])).rows[0].id;
await as('A', `select public.enroll_by_email($1, 't@demo.cm', 'teacher')`, [course2]);
const mod2 = (await as('T', `insert into public.modules (course_id, title) values ($1, 'M') returning id`, [course2])).rows[0].id;
await expectError('item cannot link page from another course', () => as('T', `insert into public.module_items (module_id, item_type, title, page_id) values ($1, 'page', 'x', $2)`, [mod2, page]));

// Storage
await as('S1', `insert into storage.objects (bucket_id, name) values ('submissions', $1)`, [`${course}/${asg}/${ids.S1}/copie.pdf`]);
check('S1 uploads own file', true);
await expectError('S2 cannot upload into course', () => as('S2', `insert into storage.objects (bucket_id, name) values ('submissions', $1)`, [`${course}/${asg}/${ids.S2}/x.pdf`]));
await expectError('S1 cannot upload under another user folder', () => as('S1', `insert into storage.objects (bucket_id, name) values ('submissions', $1)`, [`${course}/${asg}/${ids.S2}/x.pdf`]));
const tFiles = await as('T', `select name from storage.objects`);
check('teacher sees student file', tFiles.rows.length === 1);
const xFiles = await as('X', `select name from storage.objects`);
check('X sees no files', xFiles.rows.length === 0);

} catch (e) { console.log('UNEXPECTED ERROR:', e.message); failures++; }
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
