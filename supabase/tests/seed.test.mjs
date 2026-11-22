// Runs supabase/seed/demo.sql against the migrated schema (PGlite) with a
// Supabase-shaped auth.users / auth.identities stand-in.
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
  create schema extensions;
  create function extensions.gen_salt(text) returns text language sql as $$ select '$2a$06$stub' $$;
  create function extensions.crypt(text, text) returns text language sql as $$ select $2 || md5($1) $$;
`);
const seed = readFileSync(new URL('../seed/demo.sql', import.meta.url), 'utf8');
await db.exec(seed);
const n = async (sql) => Number((await db.query(sql)).rows[0].n);
check('8 login accounts', (await n('select count(*) n from auth.users')) === 8);
check('8 identities', (await n('select count(*) n from auth.identities')) === 8);
check('8 profiles via trigger', (await n('select count(*) n from public.profiles')) === 8);
check('names and locale on profiles', (await n(`select count(*) n from public.profiles where full_name = 'Dr Aïcha Bello' and locale = 'en'`)) === 1);
check('8 memberships (owner, 2 teachers, 5 students)', (await n('select count(*) n from public.memberships')) === 8);
check('3 courses mapped to UEs', (await n('select count(*) n from public.courses where teaching_unit_id is not null and semester_id is not null')) === 3);
check('18 enrolments', (await n('select count(*) n from public.enrollments')) === 18);
check('scope trigger filled institution on assignments', (await n('select count(*) n from public.assignments where institution_id is null')) === 0);
check('9 assignments', (await n('select count(*) n from public.assignments')) === 9);
check('40 marks', (await n('select count(*) n from public.grades')) === 40);
check('6 quiz questions with keys', (await n('select count(*) n from public.question_keys')) === 6);
check('quiz linked', (await n('select count(*) n from public.quizzes')) === 1);
check('9 module items', (await n('select count(*) n from public.module_items')) === 9);
check('5 programme registrations', (await n('select count(*) n from public.programme_enrollments')) === 5);
await db.exec(seed);
check('second run changes nothing', (await n('select count(*) n from public.institutions')) === 1 && (await n('select count(*) n from auth.users')) === 8);
done();
