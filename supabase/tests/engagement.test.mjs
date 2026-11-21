// Sprint 3 checks: notifications, inbox, discussions, calendar, rubrics,
// attendance check-in and course files.
import { setup } from './harness.mjs';

const { db, ids, as, check, expectError, done } = await setup(['A', 'T', 'S1', 'S2', 'X', 'XA']);
const one = async (user, sql, params) => (await as(user, sql, params)).rows[0];
const count = async (user, sql, params) => Number((await as(user, sql, params)).rows[0].n);

// ----- Two schools; the course lives in the first -----
const inst = (await one('A', `select public.create_institution('Institut Démo', 'demo') id`)).id;
for (const [email, role] of [['t@demo.cm', 'teacher'], ['s1@demo.cm', 'student'], ['s2@demo.cm', 'student']]) {
  await as('A', `select public.add_member_by_email($1, $2, $3)`, [inst, email, role]);
}
const other = (await one('XA', `select public.create_institution('Autre école', 'autre') id`)).id;
await as('XA', `select public.add_member_by_email($1, 'x@demo.cm', 'student')`, [other]);

const course = (await one('T', `insert into public.courses (institution_id, code, title) values ($1, 'INF101', 'Algo') returning id`, [inst])).id;
await as('T', `select public.enroll_by_email($1, 's1@demo.cm', 'student')`, [course]);
await as('T', `select public.enroll_by_email($1, 's2@demo.cm', 'student')`, [course]);

// ----- Notifications -----
await as('T', `insert into public.announcements (course_id, title, body) values ($1, 'Salle 12', 'Jeudi')`, [course]);
check('announcement notifies both students', (await count('S1', `select count(*) n from public.notifications where kind = 'announcement'`)) === 1
  && (await count('S2', `select count(*) n from public.notifications where kind = 'announcement'`)) === 1);
check('…but not its author', (await count('T', `select count(*) n from public.notifications where kind = 'announcement'`)) === 0);
const asg = (await one('T', `insert into public.assignments (course_id, title, points_possible) values ($1, 'TP 1', 20) returning id`, [course])).id;
check('new assignment notifies students', (await count('S1', `select count(*) n from public.notifications where kind = 'assignment'`)) === 1);
await as('S1', `insert into public.submissions (assignment_id, student_id, body) values ($1, $2, 'print(1)')`, [asg, ids.S1]);
const sub = await one('T', `select data, link from public.notifications where kind = 'submission'`);
check('submission notifies the teacher with a link to grading', sub?.link?.includes('/grade?student='));
await as('T', `insert into public.grades (assignment_id, student_id, score) values ($1, $2, 15)`, [asg, ids.S1]);
const g = await one('S1', `select data from public.notifications where kind = 'grade'`);
check('grade notifies the student with the mark', Number(g?.data?.score) === 15 && Number(g?.data?.points) === 20);
check('S2 cannot read S1 notifications', (await count('S2', `select count(*) n from public.notifications where kind = 'grade'`)) === 0);
const nid = (await one('S1', `select id from public.notifications where kind = 'grade'`)).id;
await as('S1', `update public.notifications set read_at = now() where id = $1`, [nid]);
check('student marks a notification read', (await one('S1', `select read_at from public.notifications where id = $1`, [nid])).read_at !== null);
await expectError('student cannot forge a notification',
  () => as('S1', `insert into public.notifications (institution_id, user_id, kind) values ($1, $2, 'grade')`, [inst, ids.S2]));
await expectError('student cannot rewrite a notification',
  () => as('S1', `update public.notifications set data = '{}' where id = $1`, [nid]));

// ----- Inbox -----
const conv = (await one('S1', `select public.start_conversation(array[$1]::uuid[], 'Question TP', 'Bonjour, une question sur le TP 1.') id`, [ids.T])).id;
check('student starts a conversation with the teacher', !!conv);
check('teacher has one unread conversation', (await one('T', `select public.inbox_unread_count() n`)).n === 1);
check('message notification for the teacher', (await count('T', `select count(*) n from public.notifications where kind = 'message'`)) === 1);
await as('T', `insert into public.messages (conversation_id, body) values ($1, 'Oui, je vous écoute.')`, [conv]);
check('teacher reply marks it read for them', (await one('T', `select public.inbox_unread_count() n`)).n === 0);
check('student now has one unread', (await one('S1', `select public.inbox_unread_count() n`)).n === 1);
await as('S1', `select public.mark_conversation_read($1)`, [conv]);
check('mark read clears it', (await one('S1', `select public.inbox_unread_count() n`)).n === 0);
check('outsider sees no conversation', (await count('S2', `select count(*) n from public.conversations`)) === 0);
await expectError('outsider cannot post into it', () => as('S2', `insert into public.messages (conversation_id, body) values ($1, 'hi')`, [conv]));
await expectError('cannot message someone from another school',
  () => as('S1', `select public.start_conversation(array[$1]::uuid[], 'x', 'hello')`, [ids.X]), 'forbidden');
const toOffice = (await one('S2', `select public.start_conversation(array[$1]::uuid[], 'Attestation', 'Bonjour la scolarité')`, [ids.A]));
check('student can write to the school office', !!toOffice);
await expectError('cannot forge the sender', async () => {
  await as('S1', `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'fake')`, [conv, ids.T]);
  const r = await one('T', `select sender_id from public.messages where body = 'fake'`);
  if (r.sender_id === ids.S1) throw new Error('sender forced to the real author');
});

const contacts = (await as('S1', `select id, office from public.message_contacts()`)).rows;
check('contacts: teacher, classmate and the office', contacts.some((c) => c.id === ids.T) && contacts.some((c) => c.id === ids.S2) && contacts.some((c) => c.id === ids.A && c.office));
check('contacts never include other schools', !contacts.some((c) => c.id === ids.X || c.id === ids.XA));

// ----- Discussions -----
const topic = (await one('S1', `insert into public.discussion_topics (course_id, title, body) values ($1, 'Boucles', 'Différence for / while ?') returning id, author_id`, [course]));
check('student opens a topic as its author', topic.author_id === ids.S1);
await expectError('student cannot pin a topic', () => as('S1', `update public.discussion_topics set pinned = true where id = $1`, [topic.id]), 'forbidden');
await as('S2', `insert into public.discussion_replies (topic_id, body) values ($1, 'for compte, while teste.')`, [topic.id]);
const t1 = await one('T', `select reply_count from public.discussion_topics where id = $1`, [topic.id]);
check('reply count goes up', t1.reply_count === 1);
check('topic author is notified of the reply', (await count('S1', `select count(*) n from public.notifications where kind = 'discussion'`)) === 1);
await as('T', `update public.discussion_topics set locked = true, pinned = true where id = $1`, [topic.id]);
await expectError('student cannot reply to a locked topic', () => as('S2', `insert into public.discussion_replies (topic_id, body) values ($1, 'encore')`, [topic.id]), 'topic_locked');
await as('T', `insert into public.discussion_replies (topic_id, body) values ($1, 'Fermé, voir le cours 2.')`, [topic.id]);
check('teacher can still reply when locked', (await count('S1', `select count(*) n from public.discussion_replies where topic_id = $1`, [topic.id])) === 2);
check('outsider sees no topics', (await count('X', `select count(*) n from public.discussion_topics`)) === 0);

// ----- Calendar -----
await as('T', `insert into public.calendar_events (course_id, title, kind, starts_at, ends_at, location, repeat_weekly_until)
  values ($1, 'Cours INF101', 'class', now(), now() + interval '2 hours', 'Amphi 300', (now() + interval '90 days')::date)`, [course]);
check('student sees the course timetable', (await count('S1', `select count(*) n from public.calendar_events`)) === 1);
await expectError('student cannot add course events',
  () => as('S1', `insert into public.calendar_events (course_id, title, starts_at, ends_at) values ($1, 'x', now(), now() + interval '1 hour')`, [course]));
await as('A', `insert into public.calendar_events (institution_id, title, kind, starts_at, ends_at) values ($1, 'Examens S1', 'exam', now(), now() + interval '5 days')`, [inst]);
check('institution event visible to every member', (await count('S2', `select count(*) n from public.calendar_events where course_id is null`)) === 1);
await expectError('teacher cannot add institution-wide events',
  () => as('T', `insert into public.calendar_events (institution_id, title, starts_at, ends_at) values ($1, 'x', now(), now() + interval '1 hour')`, [inst]));
check('other school sees nothing', (await count('X', `select count(*) n from public.calendar_events`)) === 0);

// ----- Rubrics -----
const criteria = [
  { id: 'c1', title: 'Code', levels: [{ id: 'a', title: 'Excellent', points: 10 }, { id: 'b', title: 'Correct', points: 6 }, { id: 'c', title: 'Insuffisant', points: 2 }] },
  { id: 'c2', title: 'Rapport', levels: [{ id: 'a', title: 'Clair', points: 5 }, { id: 'b', title: 'Confus', points: 2 }] },
];
const rubric = (await one('T', `insert into public.rubrics (course_id, title, criteria) values ($1, 'Grille TP', $2) returning id`, [course, JSON.stringify(criteria)])).id;
await as('T', `update public.assignments set rubric_id = $1 where id = $2`, [rubric, asg]);
const score = (await one('T', `select public.save_rubric_assessment($1, $2, $3::jsonb, 'Bon travail') s`,
  [asg, ids.S2, JSON.stringify({ c1: { level: 'b', comment: 'Boucle infinie évitée' }, c2: { level: 'a' } })])).s;
check('rubric scores 11/15 → 14.67/20', Number(score) === 14.67);
const grade = await one('S2', `select score, comment from public.grades where assignment_id = $1`, [asg]);
check('…and writes the grade and comment', Number(grade.score) === 14.67 && grade.comment === 'Bon travail');
check('student sees their own rubric assessment', (await count('S2', `select count(*) n from public.rubric_assessments`)) === 1);
check('…not a classmate’s', (await count('S1', `select count(*) n from public.rubric_assessments`)) === 0);
await expectError('student cannot assess', () => as('S1', `select public.save_rubric_assessment($1, $2, '{}'::jsonb)`, [asg, ids.S2]), 'forbidden');
await expectError('unknown level is rejected', () => as('T', `select public.save_rubric_assessment($1, $2, '{"c1":{"level":"zzz"}}'::jsonb)`, [asg, ids.S1]), 'invalid');

// ----- Attendance -----
const session = (await one('T', `insert into public.attendance_sessions (course_id, topic) values ($1, 'Cours 3') returning id`, [course])).id;
const code = (await one('T', `select public.open_checkin($1, 10) c`, [session])).c;
check('teacher opens a 6-digit check-in code', /^[0-9]{6}$/.test(code));
check('students cannot read the code', (await count('S1', `select count(*) n from public.attendance_codes`)) === 0);
const wrong = String((Number(code) + 1) % 1000000).padStart(6, '0');
check('wrong code is refused', (await one('S1', `select public.check_in($1) r`, [wrong])).r.status === 'invalid');
const ok = (await one('S1', `select public.check_in($1) r`, [code])).r;
check('right code checks the student in as present', ok.status === 'ok' && ok.attendance === 'present');
check('teacher sees the record', (await one('T', `select status, method from public.attendance_records where student_id = $1`, [ids.S1])).method === 'code');
await as('T', `insert into public.attendance_records (session_id, student_id, status) values ($1, $2, 'absent')`, [session, ids.S2]);
check('S2 only sees their own record', (await count('S2', `select count(*) n from public.attendance_records`)) === 1);
await expectError('student cannot mark attendance', () => as('S2', `update public.attendance_records set status = 'present' where student_id = $1`, [ids.S2]).then(async () => {
  const r = await one('T', `select status from public.attendance_records where student_id = $1`, [ids.S2]);
  if (r.status === 'absent') throw new Error('update ignored by RLS');
}));
check('outsider code check-in is refused', (await one('X', `select public.check_in($1) r`, [code])).r.status === 'invalid');
for (let i = 0; i < 8; i++) await as('S2', `select public.check_in('000000')`);
check('too many wrong codes locks check-in for a while', (await one('S2', `select public.check_in($1) r`, [code])).r.status === 'too_many_attempts');
await as('T', `select public.close_checkin($1)`, [session]);
check('closed code stops working', (await one('S1', `select public.check_in($1) r`, [code])).r.status === 'invalid');

// ----- Course files -----
const f1 = `${course}/f1/Cours 1.pdf`, f2 = `${course}/f2/Corrigé.pdf`;
await as('T', `insert into public.course_files (course_id, name, storage_path, published) values ($1, 'Cours 1.pdf', $2, true)`, [course, f1]);
await as('T', `insert into public.course_files (course_id, name, storage_path, published) values ($1, 'Corrigé.pdf', $2, false)`, [course, f2]);
check('student sees only published files', (await count('S1', `select count(*) n from public.course_files`)) === 1);
check('teacher sees all files', (await count('T', `select count(*) n from public.course_files`)) === 2);
await expectError('student cannot add files', () => as('S1', `insert into public.course_files (course_id, name, storage_path) values ($1, 'x', $2)`, [course, `${course}/x/x`]));
await expectError('file path must sit under its course', () => as('T', `insert into public.course_files (course_id, name, storage_path) values ($1, 'x', 'elsewhere/x')`, [course]), 'invalid');
await as('T', `insert into storage.objects (bucket_id, name) values ('course-files', $1)`, [f1]);
await as('T', `insert into storage.objects (bucket_id, name) values ('course-files', $1)`, [f2]);
check('student can download the published file only', (await count('S1', `select count(*) n from storage.objects where bucket_id = 'course-files'`)) === 1);
await expectError('student cannot upload course files', () => as('S1', `insert into storage.objects (bucket_id, name) values ('course-files', $1)`, [`${course}/f3/x.pdf`]));
check('a junk path does not break the policy', (await count('S1', `select count(*) n from storage.objects where name = 'not-a-uuid/x'`)) === 0);

// ----- Results notification -----
// (deliberations are covered in quiz-lmd; here just check the trigger exists and is not callable)
await expectError('trigger helpers are not callable', () => as('S1', `select public.notify_users(array[$1]::uuid[], $2, null, 'grade', '{}', null)`, [ids.S2, inst]));

void db;
done();
