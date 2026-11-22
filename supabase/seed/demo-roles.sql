-- Ardoise demo data, part 3: the school's office and departments, and its student list.
-- Run after demo.sql, demo-engage.sql and the roles migration. Safe to run twice.
--   scolarite@demo.ardoise.cm   registrar
--   hod.info@demo.ardoise.cm    head of the Computer Science department
-- Students can sign in with their matricule (e.g. ISDY26A001) or their email.
-- Password for every account: Ardoise2026!

do $seed$
declare
  pw constant text := 'Ardoise2026!';
  r record;
  uid uuid;
  v_inst uuid;
  dep uuid;
  u_registrar uuid;
  u_hod uuid;
  ros uuid;
begin
  select id into v_inst from public.institutions where slug = 'isdy';
  if v_inst is null then
    raise notice 'Run demo.sql first.';
    return;
  end if;
  if exists (select 1 from public.student_roster where institution_id = v_inst) then
    raise notice 'Roles demo data already loaded.';
    return;
  end if;
  select id into dep from public.departments where institution_id = v_inst and code = 'INFO';

  for r in
    select * from (values
      ('registrar', 'scolarite@demo.ardoise.cm', 'Clarisse Etoa', 'fr'),
      ('hod',       'hod.info@demo.ardoise.cm',  'Pr Samuel Nana', 'en')
    ) as v(key, email, full_name, locale)
  loop
    select id into uid from auth.users where email = r.email;
    if uid is null then
      uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, phone_change_token, reauthentication_token
      ) values (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', r.email,
        extensions.crypt(pw, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', r.full_name, 'locale', r.locale), now(), now(),
        '', '', '', '', '', '', ''
      );
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), uid, uid::text,
              jsonb_build_object('sub', uid::text, 'email', r.email, 'email_verified', true),
              'email', now(), now(), now());
    end if;
    if r.key = 'registrar' then u_registrar := uid; else u_hod := uid; end if;
  end loop;

  -- The demo admin is the owner; the office and the department get their own people.
  update public.memberships set role = 'owner' where institution_id = v_inst and role = 'admin';
  delete from public.memberships m where m.institution_id = v_inst and m.role = 'registrar'
    and exists (select 1 from public.memberships o where o.institution_id = v_inst and o.user_id = m.user_id and o.role = 'owner');
  insert into public.memberships (institution_id, user_id, role, department_id) values
    (v_inst, u_registrar, 'registrar', null),
    (v_inst, u_hod, 'hod', dep)
  on conflict do nothing;
  update public.courses set department_id = dep where institution_id = v_inst and department_id is null;

  -- The student list as the registrar would import it: five students already signed up,
  -- three who haven't yet.
  for r in
    select * from (values
      ('ISDY26A001', 'FON Brenda',        'brenda@demo.ardoise.cm',   array['INF101', 'MAT102', 'ENG110']),
      ('ISDY26A002', 'NKOULOU Cédric',    'cedric@demo.ardoise.cm',   array['INF101', 'MAT102', 'ENG110']),
      ('ISDY26A003', 'TCHOUMI Mireille',  'mireille@demo.ardoise.cm', array['INF101', 'MAT102', 'ENG110']),
      ('ISDY26A004', 'ABENA Yannick',     'yannick@demo.ardoise.cm',  array['INF101', 'MAT102', 'ENG110']),
      ('ISDY26A005', 'KAMGA Inès',        'ines@demo.ardoise.cm',     array['INF101', 'MAT102', 'ENG110']),
      ('ISDY26A006', 'NGONO Esther',      null,                       array['INF101', 'MAT102', 'ENG110']),
      ('ISDY26A007', 'TABI Marc',         null,                       array['INF101', 'MAT102']),
      ('ISDY26A008', 'BIH Ruth',          null,                       array['INF101', 'ENG110'])
    ) as v(matricule, full_name, email, courses)
  loop
    insert into public.student_roster (institution_id, matricule, full_name, email, programme, level, claimed_by, claimed_at)
    values (v_inst, r.matricule, r.full_name, r.email, 'Licence Informatique', 'L1',
            (select id from auth.users where email = r.email), case when r.email is null then null else now() end)
    returning id into ros;
    insert into public.roster_courses (roster_id, institution_id, course_code)
    select ros, v_inst, unnest(r.courses);
  end loop;
end
$seed$;
