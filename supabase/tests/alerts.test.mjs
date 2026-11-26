// Alerts for the Ardoise team: raised by the database, readable only by the team.
import { setup } from './harness.mjs';

const { db, ids, as, check, expectError, done, createSchool } = await setup(['A', 'T', 'S1', 'P']);
const n = async (sql, params = []) => Number((await db.query(sql, params)).rows[0].n);
const alertOf = async (kind) => (await db.query(`select * from public.alerts where kind = $1 order by id desc limit 1`, [kind])).rows[0];

const inst = await createSchool('A', 'École Alerte', 'ecole-alerte');
check('a new head of a university is reported', (await alertOf('privileged_role'))?.detail.role === 'owner');

await db.query('insert into public.platform_admins (user_id) values ($1)', [ids.P]);
check('someone joining the Ardoise team is reported', (await alertOf('team_change'))?.detail.action === 'joined');

// One teacher changing many existing marks in ten minutes.
const course = (await as('A', `insert into public.courses (institution_id, code, title) values ($1, 'INF101', 'Algo') returning id`, [inst])).rows[0].id;
await db.query(`insert into public.memberships (institution_id, user_id, role) values ($1, $2, 'teacher'), ($1, $3, 'student')`, [inst, ids.T, ids.S1]);
await db.query(`insert into public.enrollments (course_id, user_id, role) values ($1, $2, 'teacher'), ($1, $3, 'student')`, [course, ids.T, ids.S1]);
for (let i = 0; i < 31; i++) {
  const asg = (await as('T', `insert into public.assignments (course_id, title, points_possible, component) values ($1, $2, 20, 'tp') returning id`, [course, `TP ${i}`])).rows[0].id;
  await as('T', `insert into public.grades (assignment_id, student_id, score) values ($1, $2, 10)`, [asg, ids.S1]);
  if (i === 0) check('entering marks the first time is not unusual', (await n(`select count(*) n from public.alerts where kind = 'mark_changes'`)) === 0);
  await as('T', `update public.grades set score = 12 where assignment_id = $1 and student_id = $2`, [asg, ids.S1]);
}
const marks = await alertOf('mark_changes');
check('changing 30+ existing marks in ten minutes is reported, once, with who and how many',
  (await n(`select count(*) n from public.alerts where kind = 'mark_changes'`)) === 1
  && marks.detail.who === 'User T' && marks.detail.count >= 30 && marks.institution_id === inst);

// Wrong passwords with a matricule, up to the limit.
await db.exec(`alter table auth.users add column if not exists encrypted_password text`);
for (let i = 0; i < 10; i++) await as(null, `select public.login_email('UBA00X1', 'wrong-password')`, [], 'anon');
check('a matricule hitting the wrong-password limit is reported', (await alertOf('login_attack'))?.detail.matricule === 'UBA00X1');

// One account trying many matricules.
for (let i = 0; i < 10; i++) await as('S1', `select public.claim_matricule('ecole-alerte', $1, 'Someone')`, [`ZZ${i}`]);
check('one account trying many matricules is reported', (await alertOf('join_attack'))?.detail.count >= 10);

// Server errors reported by the web app: counted, not repeated; redirects ignored.
await as(null, `select public.report_app_error('/admin/upload?x=1', 'Cannot read properties of undefined', 'abc', 'action')`, [], 'anon');
await as(null, `select public.report_app_error('/admin/upload', 'Cannot read properties of undefined', 'abc', 'action')`, [], 'anon');
await as(null, `select public.report_app_error('/login', 'NEXT_REDIRECT', '', 'action')`, [], 'anon');
const err = await alertOf('app_error');
check('a server error is reported once and counted (the query string is dropped)',
  (await n(`select count(*) n from public.alerts where kind = 'app_error'`)) === 1 && err.occurrences === 2 && err.detail.path === '/admin/upload');
await expectError('nobody can raise an alert directly',
  () => as(null, `select public.raise_alert('team_change', 'critical', null, 'x', '{}')`, [], 'anon'));
await expectError('…not even a signed-in user',
  () => as('T', `select public.raise_alert('team_change', 'critical', null, 'x', '{}')`));

// Only the team reads and clears them.
check('a university user reads no alerts', Number((await as('T', `select count(*) n from public.alerts`)).rows[0].n) === 0
  && (await as('T', `select public.alerts_unseen_count() as c`)).rows[0].c === 0);
const before = (await as('P', `select public.alerts_unseen_count() as c`)).rows[0].c;
check('the team sees the warnings waiting', before >= 4);
await as('P', `update public.alerts set seen_at = now(), seen_by = $1 where seen_at is null`, [ids.P]);
check('…and marks them seen', (await as('P', `select public.alerts_unseen_count() as c`)).rows[0].c === 0);
await as('T', `update public.alerts set seen_at = null`);
check('a university user cannot touch them', (await as('P', `select public.alerts_unseen_count() as c`)).rows[0].c === 0);
done();
