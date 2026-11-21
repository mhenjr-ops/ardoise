// Runs demo.sql then demo-engage.sql on the migrated schema.
import { readFileSync } from 'node:fs';
import { setup } from './harness.mjs';

const { db, check, done } = await setup([]);
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
  create schema if not exists extensions;
  create function extensions.gen_salt(text) returns text language sql as $$ select '$2a$06$stub' $$;
  create function extensions.crypt(text, text) returns text language sql as $$ select $2 || md5($1) $$;
`);
await db.exec(readFileSync(new URL('../seed/demo.sql', import.meta.url), 'utf8'));
const engage = readFileSync(new URL('../seed/demo-engage.sql', import.meta.url), 'utf8');
await db.exec(engage);
const n = async (sql) => Number((await db.query(sql)).rows[0].n);
check('7 calendar events', (await n('select count(*) n from public.calendar_events')) === 7);
check('3 topics, 4 replies', (await n('select count(*) n from public.discussion_topics')) === 3 && (await n('select count(*) n from public.discussion_replies')) === 4);
check('reply counts kept by trigger', (await n(`select sum(reply_count) n from public.discussion_topics`)) === 4);
check('2 conversations, 3 messages', (await n('select count(*) n from public.conversations')) === 2 && (await n('select count(*) n from public.messages')) === 3);
{
  const { rows } = await db.query(`select p.full_name from public.messages m join public.profiles p on p.id = m.sender_id
    join public.conversations c on c.id = m.conversation_id where c.subject = 'Question sur le TP 1' order by m.created_at desc limit 1`);
  check("the teacher's reply is the latest message in Brenda's thread", rows[0]?.full_name === 'Dr Jean-Paul Mbarga');
  const { rows: unread } = await db.query(`select (c.last_message_at > p.last_read_at) as unread from public.conversation_participants p
    join public.conversations c on c.id = p.conversation_id join public.profiles u on u.id = p.user_id
    where c.subject = 'Question sur le TP 1' and u.full_name = 'Brenda Fon'`);
  check('Brenda has an unread reply', unread[0]?.unread === true);
}
check('rubric attached to TP 1 and TP 3', (await n(`select count(*) n from public.assignments where rubric_id is not null`)) === 2);
check('TP 3 is practice work (weight 0)', (await n(`select count(*) n from public.assignments where title like 'TP 3%' and weight = 0`)) === 1);
check('6 attendance sessions, 30 records', (await n('select count(*) n from public.attendance_sessions')) === 6 && (await n('select count(*) n from public.attendance_records')) === 30);
check('Yannick misses three sessions', (await n(`select count(*) n from public.attendance_records r join public.profiles p on p.id = r.student_id where p.email = 'yannick@demo.ardoise.cm' and r.status = 'absent'`)) === 3);
check('sessions are in the past', (await n(`select count(*) n from public.attendance_sessions where starts_at > now()`)) === 0);
check('three TP 3 hand-ins wait for grading', (await n(`select count(*) n from public.submissions s where not exists (
  select 1 from public.grades g where g.assignment_id = s.assignment_id and g.student_id = s.student_id and g.score is not null)`)) === 3);
check('hand-in times are spread out', (await n('select count(distinct submitted_at) n from public.submissions')) === (await n('select count(*) n from public.submissions')));
check('notifications created (triggers + seeded)', (await n('select count(*) n from public.notifications')) > 20);
check('syllabus written', (await n(`select count(*) n from public.courses where syllabus <> ''`)) === 2);
await db.exec(engage);
check('second run changes nothing', (await n('select count(*) n from public.discussion_topics')) === 3);
done();
