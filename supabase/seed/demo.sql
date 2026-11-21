-- Ardoise demo data: one institution, 3 courses, 2 teachers, 5 students,
-- modules, pages, assignments, a full semester of marks and a quiz.
--
-- Run once, after both migrations, in the Supabase SQL editor (or through the
-- Supabase connector). It runs as the database owner, so it creates the login
-- accounts directly. Password for every account: Ardoise2026!
--
-- Same data as web/scripts/seed-demo.mjs; use whichever is handier.

do $seed$
declare
  pw constant text := 'Ardoise2026!';
  r record;
  uid uuid;
  u_admin uuid; u_mbarga uuid; u_bello uuid;
  u_brenda uuid; u_cedric uuid; u_mireille uuid; u_yannick uuid; u_ines uuid;
  students uuid[];
  v_inst uuid;
  c_inf uuid; c_mat uuid; c_eng uuid;
  m1 uuid; m2 uuid; mat_mod uuid;
  p1 uuid; p2 uuid;
  tp1 uuid; cc1 uuid; tp2 uuid; mat_td uuid; eng_task uuid; a_id uuid;
  fac uuid; dep uuid; prog uuid; yr uuid; s1 uuid; ue uuid;
  bank uuid; q uuid; quiz_asg uuid;
begin
  if exists (select 1 from public.institutions where slug = 'isdy') then
    raise notice 'Demo institution "isdy" already exists. Delete it to re-seed.';
    return;
  end if;

  -- Login accounts (a profile row is created by the auth.users trigger)
  for r in
    select * from (values
      ('admin',    'admin@demo.ardoise.cm',    'Admin Démo',          'fr'),
      ('mbarga',   'j.mbarga@demo.ardoise.cm', 'Dr Jean-Paul Mbarga', 'fr'),
      ('bello',    'a.bello@demo.ardoise.cm',  'Dr Aïcha Bello',      'en'),
      ('brenda',   'brenda@demo.ardoise.cm',   'Brenda Fon',          'en'),
      ('cedric',   'cedric@demo.ardoise.cm',   'Cédric Nkoulou',      'fr'),
      ('mireille', 'mireille@demo.ardoise.cm', 'Mireille Tchoumi',    'fr'),
      ('yannick',  'yannick@demo.ardoise.cm',  'Yannick Abena',       'fr'),
      ('ines',     'ines@demo.ardoise.cm',     'Inès Kamga',          'fr')
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
      values (
        gen_random_uuid(), uid, uid::text,
        jsonb_build_object('sub', uid::text, 'email', r.email, 'email_verified', true),
        'email', now(), now(), now()
      );
    end if;
    case r.key
      when 'admin' then u_admin := uid;
      when 'mbarga' then u_mbarga := uid;
      when 'bello' then u_bello := uid;
      when 'brenda' then u_brenda := uid;
      when 'cedric' then u_cedric := uid;
      when 'mireille' then u_mireille := uid;
      when 'yannick' then u_yannick := uid;
      when 'ines' then u_ines := uid;
    end case;
  end loop;
  students := array[u_brenda, u_cedric, u_mireille, u_yannick, u_ines];

  -- Institution and members
  insert into public.institutions (name, slug) values ('Institut Supérieur Démo de Yaoundé', 'isdy') returning id into v_inst;
  insert into public.memberships (institution_id, user_id, role) values
    (v_inst, u_admin, 'admin'), (v_inst, u_admin, 'registrar'),
    (v_inst, u_mbarga, 'teacher'), (v_inst, u_bello, 'teacher'),
    (v_inst, u_brenda, 'student'), (v_inst, u_cedric, 'student'), (v_inst, u_mireille, 'student'),
    (v_inst, u_yannick, 'student'), (v_inst, u_ines, 'student');

  -- Courses and enrolments
  insert into public.courses (institution_id, code, title, level, language, color, description)
  values (v_inst, 'INF101', 'Algorithmique et programmation', 'L1', 'fr', '#0E7C66',
          E'Introduction aux algorithmes : variables, conditions, boucles, fonctions et tableaux. TP en Python.\nÉvaluation : CC 30 %, TP 20 %, examen 50 %.')
  returning id into c_inf;
  insert into public.courses (institution_id, code, title, level, language, color, description)
  values (v_inst, 'MAT102', 'Analyse I', 'L1', 'fr', '#1F6FEB',
          'Suites, limites, continuité et dérivabilité des fonctions d''une variable réelle.')
  returning id into c_mat;
  insert into public.courses (institution_id, code, title, level, language, color, description)
  values (v_inst, 'ENG110', 'Technical English', 'L1', 'en', '#8250DF',
          'Reading and writing technical documents in English: reports, emails and short presentations.')
  returning id into c_eng;

  insert into public.enrollments (course_id, user_id, role) values
    (c_inf, u_mbarga, 'teacher'), (c_mat, u_bello, 'teacher'), (c_eng, u_bello, 'teacher');
  insert into public.enrollments (course_id, user_id, role)
  select c.id, s.id, 'student' from unnest(array[c_inf, c_mat, c_eng]) as c(id) cross join unnest(students) as s(id);

  -- INF101 content
  insert into public.modules (course_id, title, position) values (c_inf, 'Semaine 1 — Premiers pas', 1) returning id into m1;
  insert into public.modules (course_id, title, position) values (c_inf, 'Semaine 2 — Conditions et boucles', 2) returning id into m2;

  insert into public.pages (course_id, title, body) values (c_inf, 'Bienvenue dans INF101',
    E'Bonjour à toutes et à tous,\n\nCe cours se déroule en présentiel le lundi et le jeudi, amphi 300.\nLes supports sont publiés ici chaque semaine. Les TP se rendent sur Ardoise, en PDF ou en photo depuis votre téléphone.\n\nBon semestre !')
  returning id into p1;
  insert into public.pages (course_id, title, body) values (c_inf, 'Cours 2 : les boucles for et while',
    E'Une boucle répète un bloc d''instructions.\n\nfor i in range(5):\n    print(i)\n\nwhile n > 0:\n    n = n - 1')
  returning id into p2;

  insert into public.assignments (course_id, title, description, due_at, points_possible, component, weight)
  values (c_inf, 'TP 1 — Calcul de moyenne',
          'Écrire un programme qui lit 5 notes sur 20 et affiche la moyenne. Rendre le code et une capture d''écran.',
          now() + interval '5 days', 20, 'tp', 1)
  returning id into tp1;
  insert into public.assignments (course_id, title, description, due_at, points_possible, component, weight, submission_types)
  values (c_inf, 'Contrôle continu 1', 'Devoir sur table, salle 12. Saisie des notes après correction.',
          now() - interval '3 days', 20, 'cc', 1.5, array['file'])
  returning id into cc1;
  insert into public.assignments (course_id, title, description, due_at, points_possible, component, weight)
  values (c_inf, 'TP 2 — Table de multiplication',
          'Afficher la table de multiplication d''un entier saisi, avec une boucle for puis une boucle while.',
          now() + interval '12 days', 10, 'tp', 1)
  returning id into tp2;

  insert into public.module_items (module_id, item_type, title, page_id, assignment_id, url, position) values
    (m1, 'page', 'Bienvenue dans INF101', p1, null, null, 1),
    (m1, 'header', 'Travaux pratiques', null, null, null, 2),
    (m1, 'assignment', 'TP 1 — Calcul de moyenne', null, tp1, null, 3),
    (m1, 'link', 'Documentation Python (FR)', null, null, 'https://docs.python.org/fr/3/', 4),
    (m2, 'page', 'Cours 2 : les boucles for et while', p2, null, null, 1),
    (m2, 'assignment', 'TP 2 — Table de multiplication', null, tp2, null, 2),
    (m2, 'assignment', 'Contrôle continu 1', null, cc1, null, 3);

  insert into public.announcements (course_id, title, body, author_id) values
    (c_inf, 'Salle changée pour jeudi', 'Le cours de jeudi aura lieu en salle 12 (bâtiment B), même horaire.', u_mbarga),
    (c_inf, 'Notes du CC1 disponibles', 'Les notes du contrôle continu 1 sont dans l''onglet Notes. Réclamations jusqu''à vendredi.', u_mbarga);

  insert into public.submissions (assignment_id, student_id, body)
  values (tp1, u_brenda, E'notes = [12, 15, 9, 17, 14]\nprint(sum(notes) / len(notes))  # 13.4');

  insert into public.grades (assignment_id, student_id, score, graded_by, comment)
  select cc1, students[i], (array[14.5, 11, 16, 8.5, 12.75]::numeric[])[i], u_mbarga,
         case when (array[14.5, 11, 16, 8.5, 12.75]::numeric[])[i] < 10 then 'Revoir les boucles, passez au tutorat.' end
  from generate_subscripts(students, 1) as i;

  -- MAT102 and ENG110
  insert into public.modules (course_id, title, position) values (c_mat, 'Chapitre 1 — Suites', 1) returning id into mat_mod;
  insert into public.assignments (course_id, title, due_at, points_possible, component)
  values (c_mat, 'TD 1 — Suites arithmétiques', now() + interval '7 days', 20, 'cc') returning id into mat_td;
  insert into public.module_items (module_id, item_type, title, assignment_id, position)
  values (mat_mod, 'assignment', 'TD 1 — Suites arithmétiques', mat_td, 1);

  insert into public.announcements (course_id, title, body, author_id) values
    (c_eng, 'Welcome to Technical English', 'Please bring a notebook on Tuesday. Our first task is a short self-introduction email.', u_bello);
  insert into public.assignments (course_id, title, due_at, points_possible, component)
  values (c_eng, 'Writing task 1 — Self-introduction email', now() + interval '4 days', 20, 'cc') returning id into eng_task;

  -- LMD structure
  insert into public.faculties (institution_id, name, code) values (v_inst, 'Faculté des Sciences', 'FS') returning id into fac;
  insert into public.departments (institution_id, faculty_id, name, code) values (v_inst, fac, 'Informatique', 'INFO') returning id into dep;
  insert into public.programmes (institution_id, department_id, name, code, cycle)
  values (v_inst, dep, 'Licence Informatique', 'LINF', 'licence') returning id into prog;
  insert into public.academic_years (institution_id, label, is_current) values (v_inst, '2026-2027', true) returning id into yr;
  insert into public.semesters (institution_id, academic_year_id, label) values (v_inst, yr, 'S1') returning id into s1;
  insert into public.semesters (institution_id, academic_year_id, label) values (v_inst, yr, 'S2');

  for r in
    select * from (values ('INF111', 'Programmation', 6, c_inf), ('MAT112', 'Mathématiques', 6, c_mat), ('LAN113', 'Langues', 3, c_eng))
      as v(code, title, credits, course_id)
  loop
    insert into public.teaching_units (institution_id, programme_id, semester_id, code, title, credits, level)
    values (v_inst, prog, s1, r.code, r.title, r.credits, 'L1') returning id into ue;
    update public.courses set teaching_unit_id = ue, semester_id = s1, coefficient = 1 where id = r.course_id;
  end loop;

  insert into public.programme_enrollments (programme_id, academic_year_id, level, student_id)
  select prog, yr, 'L1', s.id from unnest(students) as s(id);

  -- A full semester of marks (brenda, cedric, mireille, yannick, ines).
  -- Expected at deliberation: 3 admitted, 1 admitted by compensation, 1 resit.
  insert into public.grades (assignment_id, student_id, score)
  select tp1, students[i], (array[15, 12, 17, 9, 13]::numeric[])[i] from generate_subscripts(students, 1) as i;
  insert into public.grades (assignment_id, student_id, score)
  select tp2, students[i], (array[8, 6, 9, 4, 7]::numeric[])[i] from generate_subscripts(students, 1) as i;
  insert into public.assignments (course_id, title, component, points_possible, due_at, submission_types)
  values (c_inf, 'Examen final INF101', 'exam', 20, now() - interval '1 day', array['file']) returning id into a_id;
  insert into public.grades (assignment_id, student_id, score)
  select a_id, students[i], (array[13, 10.5, 15.5, 7, 11]::numeric[])[i] from generate_subscripts(students, 1) as i;

  insert into public.grades (assignment_id, student_id, score)
  select mat_td, students[i], (array[12, 8, 14, 6, 10]::numeric[])[i] from generate_subscripts(students, 1) as i;
  insert into public.assignments (course_id, title, component, points_possible, due_at, submission_types)
  values (c_mat, 'Examen final MAT102', 'exam', 20, now() - interval '1 day', array['file']) returning id into a_id;
  insert into public.grades (assignment_id, student_id, score)
  select a_id, students[i], (array[11.5, 8, 13, 5.5, 10.5]::numeric[])[i] from generate_subscripts(students, 1) as i;

  insert into public.grades (assignment_id, student_id, score)
  select eng_task, students[i], (array[16, 13, 15, 11, 14]::numeric[])[i] from generate_subscripts(students, 1) as i;
  insert into public.assignments (course_id, title, component, points_possible, due_at, submission_types)
  values (c_eng, 'Final exam ENG110', 'exam', 20, now() - interval '1 day', array['file']) returning id into a_id;
  insert into public.grades (assignment_id, student_id, score)
  select a_id, students[i], (array[14, 12, 14.5, 10, 12.5]::numeric[])[i] from generate_subscripts(students, 1) as i;

  -- Practice quiz (weight 0, so it never pulls the CC average down)
  insert into public.question_banks (course_id, title) values (c_inf, 'Chapitre 1 — Bases de Python') returning id into bank;
  for r in
    select * from (values
      (1, 'single', 'Quelle instruction affiche un texte à l''écran ?',
          '[{"id":"a","text":"print()"},{"id":"b","text":"input()"},{"id":"c","text":"len()"}]'::jsonb, 2, '"a"'::jsonb),
      (2, 'multiple', 'Lesquels sont des types de base en Python ?',
          '[{"id":"a","text":"int"},{"id":"b","text":"loop"},{"id":"c","text":"str"},{"id":"d","text":"float"}]'::jsonb, 3, '["a","c","d"]'::jsonb),
      (3, 'true_false', 'Une boucle while s''arrête quand sa condition devient fausse.', '[]'::jsonb, 1, 'true'::jsonb),
      (4, 'numeric', 'Que vaut 7 // 2 en Python ?', '[]'::jsonb, 2, '{"value":3,"tolerance":0}'::jsonb),
      (5, 'short', 'Quel mot-clé définit une fonction ?', '[]'::jsonb, 2, '["def"]'::jsonb),
      (6, 'essay', 'Expliquez en quelques lignes la différence entre une boucle for et une boucle while.', '[]'::jsonb, 5, null::jsonb)
    ) as v(pos, qtype, prompt, options, points, correct)
  loop
    insert into public.questions (bank_id, qtype, prompt, options, points, position)
    values (bank, r.qtype, r.prompt, r.options, r.points, r.pos) returning id into q;
    insert into public.question_keys (question_id, correct) values (q, r.correct);
  end loop;

  insert into public.assignments (course_id, title, description, due_at, points_possible, component, weight, submission_types)
  values (c_inf, 'Quiz 1 — Bases de Python', '15 minutes, 2 tentatives. Quiz d''entraînement (coefficient 0).',
          now() + interval '6 days', 20, 'cc', 0, array['quiz'])
  returning id into quiz_asg;
  insert into public.quizzes (assignment_id, bank_id, time_limit_minutes, attempts_allowed, show_results)
  values (quiz_asg, bank, 15, 2, 'after_submit');
  insert into public.module_items (module_id, item_type, title, assignment_id, position)
  values (m1, 'assignment', 'Quiz 1 — Bases de Python', quiz_asg, 5);

  raise notice 'Ardoise demo data loaded. Password for every account: %', pw;
end
$seed$;
