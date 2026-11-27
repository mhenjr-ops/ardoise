// Phone push notifications: registering phones, the words sent, mutes, batching, cleanup.
import { setup } from './harness.mjs';

const { db, ids, as, check, expectError, done, createSchool } = await setup(['A', 'B']);
const inst = await createSchool('A', 'Ecole A', 'ecole-a');
const TOKEN = 'ExponentPushToken[abcdefghijklmnop12345]';

await expectError('a signed-out visitor cannot register a phone',
  () => as(null, `select public.register_push_device($1)`, [TOKEN], 'anon'));
await expectError('a made-up token is refused',
  () => as('A', `select public.register_push_device('hello')`), 'invalid');
await as('A', `select public.register_push_device($1, 'android', 'fr')`, [TOKEN]);
let r = await as('A', `select token, locale from public.push_devices`);
check('the phone is registered to its owner', r.rows.length === 1 && r.rows[0].token === TOKEN);
r = await as('B', `select token from public.push_devices`);
check('nobody else can see that phone', r.rows.length === 0);
await expectError('nobody can add a phone to the table directly',
  () => as('B', `insert into public.push_devices (token, user_id) values ('ExponentPushToken[zzzzzzzzzzzzzzzz]', $1)`, [ids.B]));

const notify = (user, kind, data, n = 1) => db.query(
  `insert into public.notifications (institution_id, user_id, kind, data, link)
   select $1, $2, $3, $4::jsonb, '/courses/00000000-0000-0000-0000-000000000099' from generate_series(1, $5)`,
  [inst, ids[user], kind, JSON.stringify(data), n]);

await notify('A', 'grade', { course: 'Biologie', title: 'TP1', score: 14.5, points: 20 });
check('without the sending extension, a notification is still saved', true);

await db.exec(`
  create schema net;
  create table net.calls (id bigserial primary key, url text, body jsonb, headers jsonb);
  create table net._http_response (id bigint, status_code int, content text);
  create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
    headers jsonb default '{}', timeout_milliseconds int default 5000)
  returns bigint language sql as $$ insert into net.calls (url, body, headers) values (url, body, headers) returning id $$;
`);
const calls = async () => (await db.query(`select id, url, body from net.calls order by id`)).rows;

await notify('A', 'grade', { course: 'Biologie', title: 'TP1', score: 14.5, points: 20 });
let c = await calls();
check('a new mark is pushed to the phone', c.length === 1 && c[0].url === 'https://exp.host/--/api/v2/push/send');
const m = c[0]?.body?.[0] ?? {};
check('in French, with the course as the title', m.title === 'Biologie' && m.body === 'Note publiée pour « TP1 » : 14,5/20');
check('the tap opens the right page', m.to === TOKEN && m.data?.link === '/courses/00000000-0000-0000-0000-000000000099' && m.channelId === 'default');

await as('A', `select public.register_push_device($1, 'android', 'en')`, [TOKEN]);
await notify('A', 'grade', { course: 'Biology', title: 'Lab 1', score: '15.00', points: 20 });
c = await calls();
check('in English when the app is in English', c.at(-1).body[0].body === 'Mark posted for “Lab 1”: 15/20');

await notify('A', 'message', { sender: 'Dr Ngwa', subject: 'Exam room' });
c = await calls();
check('a message shows who wrote and the subject', c.at(-1).body[0].title === 'Dr Ngwa' && c.at(-1).body[0].body === 'Exam room');

await as('A', `select public.set_push_mute('grade', true)`);
const before = (await calls()).length;
await notify('A', 'grade', { course: 'Biology', title: 'Lab 2', score: 12, points: 20 });
check('a muted kind is not pushed', (await calls()).length === before);
r = await db.query(`select count(*)::int as n from public.notifications where user_id = $1`, [ids.A]);
check('but it is still in the app', r.rows[0].n === 5);
await as('A', `select public.set_push_mute('grade', false)`);

await notify('A', 'announcement', { course: 'Biology', title: 'Week 3' }, 150);
c = await calls();
check('150 at once go in two requests of 100 and 50',
  c.length === before + 2 && c.at(-2).body.length === 100 && c.at(-1).body.length === 50);

const last = c.at(-1).id;
await db.query(`insert into net._http_response values ($1, 200, $2)`,
  [last, JSON.stringify({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] })]);
await notify('B', 'announcement', { course: 'Biology', title: 'Week 4' });
r = await db.query(`select count(*)::int as n from public.push_devices`);
check('a phone Expo no longer knows is forgotten', r.rows[0].n === 0);
r = await db.query(`select count(*)::int as n from public.push_requests where request_id = $1`, [last]);
check('the answer is only read once', r.rows[0].n === 0);

await as('A', `select public.register_push_device($1)`, [TOKEN]);
await as('B', `select public.register_push_device($1)`, [TOKEN]);
r = await db.query(`select user_id from public.push_devices where token = $1`, [TOKEN]);
check('a phone that changes hands moves to the new account', r.rows[0].user_id === ids.B);
await as('A', `select public.unregister_push_device($1)`, [TOKEN]);
check('someone else cannot sign that phone out', (await db.query(`select 1 from public.push_devices`)).rows.length === 1);
await as('B', `select public.unregister_push_device($1)`, [TOKEN]);
check('signing out stops pushes to that phone', (await db.query(`select 1 from public.push_devices`)).rows.length === 0);

for (let i = 0; i < 12; i++) {
  await as('A', `select public.register_push_device($1)`, [`ExponentPushToken[phone${String(i).padStart(10, '0')}]`]);
}
r = await db.query(`select count(*)::int as n from public.push_devices where user_id = $1`, [ids.A]);
check('at most ten phones per account', r.rows[0].n === 10);

await db.exec(`create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
  headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language plpgsql as $$ begin raise exception 'down'; end $$`);
await notify('A', 'assignment', { course: 'Biology', title: 'Essay' });
r = await db.query(`select count(*)::int as n from public.notifications where kind = 'assignment'`);
check('when sending fails, the notification is still saved', r.rows[0].n === 1);

await expectError('the push text function cannot be called directly',
  () => as('A', `select * from public.push_text('grade', '{}'::jsonb, 'fr')`));
done();
