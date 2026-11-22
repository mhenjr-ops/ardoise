-- University of Bamenda presentation accounts: the university's administrator, a lecturer
-- who teaches in three departments and a Level 200 student with a full first-semester load, with their
-- classmates, lecturers, timetable and first week of work.
-- Run after uba.sql. Safe to run twice (does nothing the second time).
--
-- The three accounts you sign in with share one password, given at run time so it is never
-- in the repository:
--   select set_config('ardoise.demo_password', 'your-password', false);
-- Everyone else (classmates, other lecturers) gets a random password nobody knows.
--   admin.uba@demo.ardoise.cm     Administrator, owner of UBa (the university's own view)
--   p.nfor@demo.ardoise.cm        Dr Peter Nfor, lecturer (CSC201, CSC205, CEC203, ECO207)
--   d.ngwa@demo.ardoise.cm        Ngwa Divine Achu, student, matricule UBA25S0217

do $seed$
declare
  pw constant text := nullif(current_setting('ardoise.demo_password', true), '');
  inst uuid;
  sem uuid;
  sem_end date;
  monday timestamp;
  r record;
  uid uuid;
  u jsonb;
  c jsonb;
  cid uuid;
  ros uuid;
  tid uuid;
  mod uuid;
  pg uuid;
  asg uuid;
  people constant jsonb := $json$[
    {"key": "admin", "email": "admin.uba@demo.ardoise.cm", "name": "Administrator", "role": "owner", "login": true},
    {"key": "nfor", "email": "p.nfor@demo.ardoise.cm", "name": "Dr Peter Nfor", "role": "teacher", "dept": "Mathematics and Computer Science", "login": true},
    {"key": "ndi", "email": "uba.e.ndi@demo.ardoise.cm", "name": "Prof. Emmanuel Ndi", "role": "teacher", "dept": "Mathematics and Computer Science"},
    {"key": "akum", "email": "uba.r.akum@demo.ardoise.cm", "name": "Dr Rita Akum", "role": "teacher", "dept": "Mathematics and Computer Science"},
    {"key": "tanyi", "email": "uba.g.tanyi@demo.ardoise.cm", "name": "Dr Grace Tanyi", "role": "teacher", "dept": "Physics"},
    {"key": "ambe", "email": "uba.c.ambe@demo.ardoise.cm", "name": "Mrs Comfort Ambe", "role": "teacher", "dept": "English"},
    {"key": "divine", "email": "d.ngwa@demo.ardoise.cm", "name": "NGWA Divine Achu", "role": "student", "matricule": "UBA25S0217", "group": "csc", "login": true},
    {"key": "s1", "email": "uba.c.awah@demo.ardoise.cm", "name": "AWAH Clinton Neba", "role": "student", "matricule": "UBA25S0219", "group": "csc"},
    {"key": "s2", "email": "uba.p.bih@demo.ardoise.cm", "name": "BIH Precious Ngum", "role": "student", "matricule": "UBA25S0221", "group": "csc"},
    {"key": "s3", "email": "uba.l.fongoh@demo.ardoise.cm", "name": "FONGOH Lesley Che", "role": "student", "matricule": "UBA25S0224", "group": "csc"},
    {"key": "s4", "email": "uba.b.nji@demo.ardoise.cm", "name": "NJI Bertrand Tamfu", "role": "student", "matricule": "UBA25S0230", "group": "csc"},
    {"key": "s5", "email": "uba.m.atanga@demo.ardoise.cm", "name": "ATANGA Mirabel Sih", "role": "student", "matricule": "UBA25S0236", "group": "csc"},
    {"key": "e1", "email": "uba.k.mbah@demo.ardoise.cm", "name": "MBAH Kelvin Ndze", "role": "student", "matricule": "UBA25E1104", "group": "nahpi"},
    {"key": "e2", "email": "uba.j.tebid@demo.ardoise.cm", "name": "TEBID Joy Asong", "role": "student", "matricule": "UBA25E1112", "group": "nahpi"},
    {"key": "e3", "email": "uba.r.nkeng@demo.ardoise.cm", "name": "NKENG Rodrigue Fru", "role": "student", "matricule": "UBA25E1131", "group": "nahpi"},
    {"key": "f1", "email": "uba.a.nchang@demo.ardoise.cm", "name": "NCHANG Abigail Lum", "role": "student", "matricule": "UBA25M0403", "group": "fems"},
    {"key": "f2", "email": "uba.d.tamon@demo.ardoise.cm", "name": "TAMON Derick Ayuk", "role": "student", "matricule": "UBA25M0417", "group": "fems"},
    {"key": "f3", "email": "uba.s.ewi@demo.ardoise.cm", "name": "EWI Sandrine Manka", "role": "student", "matricule": "UBA25M0422", "group": "fems"}
  ]$json$;
  courses constant jsonb := $json$[
    {"code": "CSC201", "title": "Data Structures and Algorithms", "dept": "Mathematics and Computer Science", "teacher": "nfor", "group": "csc",
     "about": "Arrays, linked lists, stacks, queues, trees and graphs; searching and sorting; analysing the cost of an algorithm.",
     "slots": [[0, 8, 2, "Amphi 250"], [2, 13, 2, "Computer Lab 2"]]},
    {"code": "CSC205", "title": "Introduction to Database Systems", "dept": "Mathematics and Computer Science", "teacher": "nfor", "group": "csc",
     "about": "The relational model, entity-relationship design, SQL, normalisation and transactions.",
     "slots": [[1, 10, 2, "Hall B12"]]},
    {"code": "MAT201", "title": "Linear Algebra I", "dept": "Mathematics and Computer Science", "teacher": "ndi", "group": "csc",
     "about": "Vector spaces, linear maps, matrices, determinants and systems of linear equations.",
     "slots": [[0, 13, 2, "Amphi 250"]]},
    {"code": "MAT203", "title": "Real Analysis I", "dept": "Mathematics and Computer Science", "teacher": "ndi", "group": "csc",
     "about": "Real numbers, sequences and series, limits and continuity.",
     "slots": [[3, 8, 2, "Hall A3"]]},
    {"code": "STA201", "title": "Probability and Statistics I", "dept": "Mathematics and Computer Science", "teacher": "akum", "group": "csc",
     "about": "Probability spaces, random variables, common distributions, expectation and variance.",
     "slots": [[1, 13, 2, "Hall B12"]]},
    {"code": "PHY201", "title": "Electricity and Magnetism", "dept": "Physics", "teacher": "tanyi", "group": "csc",
     "about": "Electrostatics, circuits, magnetic fields and electromagnetic induction.",
     "slots": [[2, 8, 2, "Physics Lab 1"]]},
    {"code": "ENG201", "title": "Use of English and Communication Skills", "dept": "English", "teacher": "ambe", "group": "csc",
     "about": "Academic reading and writing, note-taking, reports and presentations.",
     "slots": [[4, 10, 2, "Amphi 600"]]},
    {"code": "CEC203", "title": "Digital Electronics", "dept": "Computer Engineering", "school": "NAHPI", "teacher": "nfor", "group": "nahpi",
     "about": "Number systems, logic gates, Boolean algebra, combinational and sequential circuits.",
     "slots": [[3, 13, 3, "NAHPI Lab 4"]]},
    {"code": "ECO207", "title": "Computer Applications in Economics", "dept": "Economics", "teacher": "nfor", "group": "fems",
     "about": "Spreadsheets for economic data, charts, simple models and an introduction to statistical software.",
     "slots": [[4, 13, 2, "FEMS Computer Room"]]}
  ]$json$;
  ids jsonb := '{}'::jsonb;
  dep uuid;
  slot jsonb;
begin
  select id into inst from public.institutions where slug = 'uba';
  if inst is null then
    raise notice 'Run uba.sql first.';
    return;
  end if;
  if exists (select 1 from auth.users where email = 'p.nfor@demo.ardoise.cm') then
    raise notice 'UBa presentation accounts already loaded.';
    return;
  end if;
  if pw is null or length(pw) < 8 then
    raise exception 'Set the password first: select set_config(''ardoise.demo_password'', ''...'', false);';
  end if;
  sem := public.current_semester(inst);
  select coalesce(ends_on, (now() + interval '100 days')::date) into sem_end from public.semesters where id = sem;
  monday := date_trunc('week', now() at time zone 'Africa/Douala');

  -- People
  for u in select * from jsonb_array_elements(people) loop
    uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', u ->> 'email',
      extensions.crypt(case when (u ->> 'login')::boolean then pw else gen_random_uuid()::text end, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', u ->> 'name', 'locale', 'en'), now(), now(),
      '', '', '', '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text,
            jsonb_build_object('sub', uid::text, 'email', u ->> 'email', 'email_verified', true),
            'email', now(), now(), now());
    update public.profiles set full_name = u ->> 'name', locale = 'en' where id = uid;
    ids := ids || jsonb_build_object(u ->> 'key', uid);
    if u ->> 'role' = 'owner' then
      insert into public.memberships (institution_id, user_id, role) values (inst, uid, 'owner');
    elsif u ->> 'role' = 'teacher' then
      select d.id into dep from public.departments d where d.institution_id = inst and d.name = u ->> 'dept' limit 1;
      insert into public.memberships (institution_id, user_id, role, department_id) values (inst, uid, 'teacher', dep);
    else
      -- Students are on the registrar's list, already linked to their accounts.
      insert into public.memberships (institution_id, user_id, role) values (inst, uid, 'student');
      insert into public.student_roster (institution_id, matricule, full_name, email, programme, level, claimed_by, claimed_at)
      values (inst, u ->> 'matricule', u ->> 'name', u ->> 'email',
              case u ->> 'group' when 'csc' then 'Combined Mathematics and Computer Science'
                                 when 'nahpi' then 'Computer Engineering' else 'Economics' end,
              '200', uid, now());
    end if;
  end loop;

  -- Three more classmates on the list who haven't created their account yet.
  insert into public.student_roster (institution_id, matricule, full_name, programme, level) values
    (inst, 'UBA25S0241', 'CHE Valery Ngwa', 'Combined Mathematics and Computer Science', '200'),
    (inst, 'UBA25S0248', 'NDANG Faith Mbuh', 'Combined Mathematics and Computer Science', '200'),
    (inst, 'UBA25S0252', 'SAMA Bless Kum', 'Combined Mathematics and Computer Science', '200')
  on conflict do nothing;

  -- Courses, lecturers, registrations, timetable
  for c in select * from jsonb_array_elements(courses) loop
    select d.id into dep from public.departments d
    left join public.faculties f on f.id = d.faculty_id
    where d.institution_id = inst and d.name = c ->> 'dept' and (c ->> 'school' is null or f.code = c ->> 'school')
    limit 1;
    insert into public.courses (institution_id, code, title, description, syllabus, language, level, department_id, semester_id, created_by)
    values (inst, c ->> 'code', c ->> 'title', c ->> 'about',
            (c ->> 'about') || E'\n\nAssessment\nContinuous assessment 30 %, practicals 20 %, final examination 50 %.',
            'en', '200', dep, sem, (ids ->> (c ->> 'teacher'))::uuid)
    returning id into cid;
    ids := ids || jsonb_build_object(c ->> 'code', cid);
    insert into public.enrollments (institution_id, course_id, user_id, role)
    values (inst, cid, (ids ->> (c ->> 'teacher'))::uuid, 'teacher');
    insert into public.enrollments (institution_id, course_id, user_id, role)
    select inst, cid, (ids ->> (p ->> 'key'))::uuid, 'student'
    from jsonb_array_elements(people) p where p ->> 'group' = c ->> 'group';
    insert into public.roster_courses (roster_id, institution_id, course_code, semester_id)
    select s.id, inst, c ->> 'code', sem from public.student_roster s
    where s.institution_id = inst and s.programme = case c ->> 'group' when 'csc' then 'Combined Mathematics and Computer Science'
                                                                       when 'nahpi' then 'Computer Engineering' else 'Economics' end
    on conflict do nothing;
    for slot in select * from jsonb_array_elements(c -> 'slots') loop
      insert into public.calendar_events (institution_id, course_id, title, kind, location, starts_at, ends_at, repeat_weekly_until, created_by)
      values (inst, cid, (c ->> 'code') || ' ' || (c ->> 'title'), 'class', slot ->> 3,
              (monday + make_interval(days => (slot ->> 0)::int, hours => (slot ->> 1)::int)) at time zone 'Africa/Douala',
              (monday + make_interval(days => (slot ->> 0)::int, hours => (slot ->> 1)::int + (slot ->> 2)::int)) at time zone 'Africa/Douala',
              sem_end, (ids ->> (c ->> 'teacher'))::uuid);
    end loop;
    insert into public.announcements (course_id, title, body, author_id)
    values (cid, 'Welcome to ' || (c ->> 'code'),
            'Welcome to ' || (c ->> 'title') || '. The outline and first readings are under Modules. Check the timetable for our lecture hall.',
            (ids ->> (c ->> 'teacher'))::uuid);
  end loop;

  insert into public.calendar_events (institution_id, title, kind, location, starts_at, ends_at, created_by)
  values (inst, 'First Semester examinations', 'exam', 'Bambili campus',
          (coalesce(sem_end, (now() + interval '80 days')::date) - 20 + interval '8 hours') at time zone 'Africa/Douala',
          (coalesce(sem_end, (now() + interval '80 days')::date) - 8 + interval '17 hours') at time zone 'Africa/Douala',
          (ids ->> 'nfor')::uuid);

  -- Dr Nfor's first week of work
  cid := (ids ->> 'CSC201')::uuid;
  tid := (ids ->> 'nfor')::uuid;
  insert into public.modules (course_id, title, position) values (cid, 'Week 1 — Arrays and linked lists', 1) returning id into mod;
  insert into public.pages (course_id, title, body) values (cid, 'Course outline',
    E'Lectures: Monday 8–10 (Amphi 250). Practicals: Wednesday 13–15 (Computer Lab 2).\n\nWeek 1: arrays and linked lists\nWeek 2: stacks and queues\nWeek 3: trees\nWeek 4: sorting\nWeek 5: graphs\n\nHand in lab work here, as a PDF or a photo from your phone.')
  returning id into pg;
  insert into public.assignments (course_id, title, description, due_at, points_possible, component, weight)
  values (cid, 'Lab 1 — Linked list operations',
          'Implement insert, delete and search on a singly linked list. Submit your code and a screenshot of the output.',
          now() + interval '4 days', 20, 'tp', 1)
  returning id into asg;
  insert into public.module_items (module_id, item_type, title, page_id, assignment_id, position) values
    (mod, 'page', 'Course outline', pg, null, 1),
    (mod, 'assignment', 'Lab 1 — Linked list operations', null, asg, 2);

  cid := (ids ->> 'CSC205')::uuid;
  insert into public.modules (course_id, title, position) values (cid, 'Week 1 — The relational model', 1) returning id into mod;
  insert into public.assignments (course_id, title, description, due_at, points_possible, component, weight)
  values (cid, 'Assignment 1 — Design a hostel database',
          'Draw the entity-relationship diagram for a student hostel: rooms, students, payments and visitors.',
          now() + interval '9 days', 20, 'cc', 1)
  returning id into asg;
  insert into public.module_items (module_id, item_type, title, assignment_id, position) values (mod, 'assignment', 'Assignment 1 — Design a hostel database', asg, 1);

  cid := (ids ->> 'ECO207')::uuid;
  insert into public.assignments (course_id, title, description, due_at, points_possible, component, weight)
  values (cid, 'Exercise 1 — Price index in a spreadsheet',
          'Build a consumer price index for Bamenda market from the data sheet under Files, with a chart.',
          now() + interval '6 days', 20, 'cc', 1);

  cid := (ids ->> 'MAT201')::uuid;
  insert into public.assignments (course_id, title, due_at, points_possible, component)
  values (cid, 'Tutorial sheet 1 — Vector spaces', now() + interval '5 days', 20, 'cc');
end
$seed$;
