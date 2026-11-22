// Shared test harness: real Postgres (PGlite) + stand-ins for Supabase auth and storage.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';

const STUB = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb, last_sign_in_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to authenticated;
grant all on storage.objects to authenticated;
grant execute on function storage.foldername(text) to authenticated;
grant usage on schema public to anon;
`;

export async function setup(userKeys) {
  const db = new PGlite();
  await db.exec(STUB);
  const dir = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(readFileSync(new URL(file, dir), 'utf8'));
    } catch (e) {
      console.log(`MIGRATION ERROR in ${file}:`, e.message);
      process.exit(1);
    }
  }
  const ids = {};
  userKeys.forEach((k, i) => {
    ids[k] = `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`;
  });
  for (const [k, id] of Object.entries(ids)) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
      id,
      `${k.toLowerCase()}@demo.cm`,
      JSON.stringify({ full_name: `User ${k}` }),
    ]);
  }

  let failures = 0;
  async function as(user, sql, params = [], role = 'authenticated') {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ? ids[user] : '']);
    await db.exec(`set role ${role}`);
    try {
      return await db.query(sql, params);
    } finally {
      await db.exec('reset role');
    }
  }
  function check(label, cond) {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
    if (!cond) failures++;
  }
  async function expectError(label, fn, match) {
    try {
      await fn();
      check(`${label} (expected an error)`, false);
    } catch (e) {
      const msg = e.message.split('\n')[0];
      check(`${label} -> ${msg}`, match ? msg.includes(match) : true);
    }
  }
  // Schools are created by platform admins; tests borrow that role for a moment.
  async function createSchool(user, name, slug) {
    await db.query('insert into public.platform_admins (user_id) values ($1) on conflict do nothing', [ids[user]]);
    let id;
    try {
      id = (await as(user, 'select public.create_institution($1, $2) as id', [name, slug])).rows[0].id;
    } finally {
      await db.query('delete from public.platform_admins where user_id = $1', [ids[user]]);
    }
    // In real life the owner joins with the link from the console; tests make them owner directly.
    await db.query(`insert into public.memberships (institution_id, user_id, role) values ($1, $2, 'owner')`, [id, ids[user]]);
    return id;
  }
  function done() {
    console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
    process.exit(failures ? 1 : 0);
  }
  return { db, ids, as, check, expectError, done, createSchool, fail: () => failures++ };
}
