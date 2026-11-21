-- Ardoise demo data, part 2 (sprint 3): timetable, syllabus, discussions,
-- messages, a rubric, attendance and notifications.
-- Run after demo.sql and the engagement migration. Safe to run twice.

do $seed$
declare
  v_inst uuid;
  c_inf uuid; c_mat uuid; c_eng uuid;
  u_admin uuid; u_mbarga uuid; u_bello uuid;
  u_brenda uuid; u_cedric uuid; u_mireille uuid; u_yannick uuid; u_ines uuid;
  students uuid[];
  monday timestamp;
  tp1 uuid;
  rub uuid;
  topic1 uuid; topic2 uuid; r1 uuid;
  conv uuid;
  sess uuid;
  i int;
  pattern text[];
begin
  select id into v_inst from public.institutions where slug = 'isdy';
  if v_inst is null then
    raise notice 'Run demo.sql first.';
    return;
  end if;
  select id into c_inf from public.courses where institution_id = v_inst and code = 'INF101';
  select id into c_mat from public.courses where institution_id = v_inst and code = 'MAT102';
  select id into c_eng from public.courses where institution_id = v_inst and code = 'ENG110';
  if exists (select 1 from public.discussion_topics where course_id = c_inf) then
    raise notice 'Sprint 3 demo data already loaded.';
    return;
  end if;

  select id into u_admin from auth.users where email = 'admin@demo.ardoise.cm';
  select id into u_mbarga from auth.users where email = 'j.mbarga@demo.ardoise.cm';
  select id into u_bello from auth.users where email = 'a.bello@demo.ardoise.cm';
  select id into u_brenda from auth.users where email = 'brenda@demo.ardoise.cm';
  select id into u_cedric from auth.users where email = 'cedric@demo.ardoise.cm';
  select id into u_mireille from auth.users where email = 'mireille@demo.ardoise.cm';
  select id into u_yannick from auth.users where email = 'yannick@demo.ardoise.cm';
  select id into u_ines from auth.users where email = 'ines@demo.ardoise.cm';
  students := array[u_brenda, u_cedric, u_mireille, u_yannick, u_ines];

  -- Monday 00:00 of this week, Cameroon time
  monday := date_trunc('week', now() at time zone 'Africa/Douala');

  -- Syllabus
  update public.courses set syllabus = E'Objectifs\nÀ la fin du semestre, vous saurez décomposer un problème en étapes, écrire des algorithmes clairs et les traduire en Python.\n\nPrérequis\nAucun. Un ordinateur ou un téléphone suffit pour les TP.\n\nProgramme\nSemaine 1 : variables, types et entrées-sorties\nSemaine 2 : conditions et boucles\nSemaine 3 : fonctions\nSemaine 4 : listes et tableaux\nSemaine 5 : chaînes de caractères\nSemaine 6 : révision et TP noté\n\nÉvaluation\nContrôle continu 30 %, travaux pratiques 20 %, examen final 50 %.\n\nBibliographie\nG. Swinnen, Apprendre à programmer avec Python 3, Eyrolles.'
  where id = c_inf;
  update public.courses set syllabus = E'Suites numériques, limites, continuité, dérivabilité, théorèmes des accroissements finis. TD chaque mardi.\n\nÉvaluation : CC 30 %, examen 70 %.'
  where id = c_mat;

  -- Timetable (weekly until the end of the semester) and school-wide dates
  insert into public.calendar_events (institution_id, course_id, title, kind, location, starts_at, ends_at, repeat_weekly_until) values
    (v_inst, c_inf, 'INF101 Cours magistral', 'class', 'Amphi 300', (monday + interval '8 hours') at time zone 'Africa/Douala', (monday + interval '10 hours') at time zone 'Africa/Douala', (now() + interval '100 days')::date),
    (v_inst, c_inf, 'INF101 TP', 'class', 'Salle machines B', (monday + interval '3 days 8 hours') at time zone 'Africa/Douala', (monday + interval '3 days 10 hours') at time zone 'Africa/Douala', (now() + interval '100 days')::date),
    (v_inst, c_mat, 'MAT102 Cours et TD', 'class', 'Salle 12', (monday + interval '1 day 10 hours') at time zone 'Africa/Douala', (monday + interval '1 day 12 hours 30 minutes') at time zone 'Africa/Douala', (now() + interval '100 days')::date),
    (v_inst, c_eng, 'ENG110 Technical English', 'class', 'Labo de langues', (monday + interval '2 days 14 hours') at time zone 'Africa/Douala', (monday + interval '2 days 16 hours') at time zone 'Africa/Douala', (now() + interval '100 days')::date),
    (v_inst, c_mat, 'Permanence Dr Bello', 'office_hours', 'Bureau 204', (monday + interval '4 days 15 hours') at time zone 'Africa/Douala', (monday + interval '4 days 16 hours') at time zone 'Africa/Douala', (now() + interval '100 days')::date),
    (v_inst, null, 'Examens du semestre 1', 'exam', 'Campus', ((now() + interval '45 days')::date + interval '8 hours') at time zone 'Africa/Douala', ((now() + interval '52 days')::date + interval '17 hours') at time zone 'Africa/Douala', null),
    (v_inst, null, 'Journée portes ouvertes', 'event', 'Hall principal', ((now() + interval '9 days')::date + interval '9 hours') at time zone 'Africa/Douala', ((now() + interval '9 days')::date + interval '15 hours') at time zone 'Africa/Douala', null);
  update public.calendar_events set created_by = u_mbarga where course_id = c_inf;
  update public.calendar_events set created_by = u_bello where course_id in (c_mat, c_eng);
  update public.calendar_events set created_by = u_admin where course_id is null and institution_id = v_inst;

  -- Discussions
  insert into public.discussion_topics (course_id, title, body, author_id, pinned)
  values (c_inf, 'Questions sur le TP 1', E'Posez ici vos questions sur le TP 1 (calcul de moyenne). Je réponds chaque soir.', u_mbarga, true)
  returning id into topic1;
  insert into public.discussion_replies (topic_id, author_id, body)
  values (topic1, u_ines, 'Est-ce qu''on doit gérer le cas où l''utilisateur tape une note au-dessus de 20 ?')
  returning id into r1;
  insert into public.discussion_replies (topic_id, parent_id, author_id, body)
  values (topic1, r1, u_mbarga, 'Oui : affichez un message et redemandez la note. C''est un bon réflexe à prendre.');

  insert into public.discussion_topics (course_id, title, body, author_id)
  values (c_inf, 'Quand utiliser for plutôt que while ?', E'Je ne vois pas bien la différence entre les deux boucles. Quelqu''un peut expliquer avec un exemple ?', u_cedric)
  returning id into topic2;
  insert into public.discussion_replies (topic_id, author_id, body)
  values (topic2, u_brenda, E'for quand tu connais le nombre de tours (parcourir une liste de notes), while quand tu attends une condition (redemander tant que la saisie est invalide).');
  insert into public.discussion_replies (topic_id, author_id, body)
  values (topic2, u_mbarga, E'Exactement. Exemple : for note in notes: ... contre while note > 20: note = float(input()). On en parle jeudi en TP.');

  insert into public.discussion_topics (course_id, title, body, author_id)
  values (c_eng, 'Useful phrases for formal emails', E'Share one phrase you find useful when writing to a lecturer or an employer.', u_bello);

  -- Inbox
  insert into public.conversations (institution_id, course_id, subject, created_by)
  values (v_inst, c_inf, 'Question sur le TP 1', u_brenda) returning id into conv;
  insert into public.conversation_participants (conversation_id, user_id, institution_id, last_read_at)
  values (conv, u_brenda, v_inst, now()), (conv, u_mbarga, v_inst, now() - interval '1 day');
  insert into public.messages (conversation_id, sender_id, body)
  values (conv, u_brenda, E'Bonjour Docteur, puis-je rendre le TP 1 en photo depuis mon téléphone ? Mon ordinateur est en panne.');
  insert into public.messages (conversation_id, sender_id, body)
  values (conv, u_mbarga, E'Bonjour Brenda, oui bien sûr : une photo nette du code et une capture du résultat suffisent.');

  insert into public.conversations (institution_id, subject, created_by)
  values (v_inst, 'Attestation de scolarité', u_cedric) returning id into conv;
  insert into public.conversation_participants (conversation_id, user_id, institution_id, last_read_at)
  values (conv, u_cedric, v_inst, now()), (conv, u_admin, v_inst, null);
  insert into public.messages (conversation_id, sender_id, body)
  values (conv, u_cedric, E'Bonjour, j''ai besoin d''une attestation de scolarité pour ma demande de bourse. Comment faire ?');

  -- Rubric on TP 1, with Brenda's assessment matching her 15/20
  select id into tp1 from public.assignments where course_id = c_inf and title like 'TP 1%';
  insert into public.rubrics (course_id, title, criteria, created_by) values (
    c_inf, 'Grille TP programmation',
    '[{"id":"c1","title":"Le programme fonctionne","description":"Résultat juste sur les cas de test","levels":[{"id":"l1","title":"Excellent","points":10},{"id":"l2","title":"Satisfaisant","points":6},{"id":"l3","title":"Insuffisant","points":2}]},
      {"id":"c2","title":"Lisibilité du code","description":"Noms de variables, commentaires","levels":[{"id":"l1","title":"Excellent","points":5},{"id":"l2","title":"Satisfaisant","points":3},{"id":"l3","title":"Insuffisant","points":1}]},
      {"id":"c3","title":"Compte rendu","description":"Capture et explication","levels":[{"id":"l1","title":"Clair","points":5},{"id":"l2","title":"Confus","points":2}]}]'::jsonb,
    u_mbarga)
  returning id into rub;
  update public.assignments set rubric_id = rub where id = tp1;
  insert into public.rubric_assessments (institution_id, course_id, assignment_id, student_id, rubric_id, ratings, assessed_by)
  values (v_inst, c_inf, tp1, u_brenda, rub,
    '{"c1":{"level":"l1","points":10,"comment":"Tous les cas passent."},"c2":{"level":"l2","points":3,"comment":"Ajoutez des commentaires."},"c3":{"level":"l2","points":2,"comment":""}}'::jsonb,
    u_mbarga);

  -- Attendance: six past sessions of INF101
  pattern := array['pppppp', 'ppppap', 'pppppp', 'apalap', 'pppppp']; -- one string per student, one letter per session
  for i in 0..5 loop
    insert into public.attendance_sessions (course_id, starts_at, topic, created_by)
    values (c_inf,
            (monday - make_interval(days => 21 - (i / 2) * 7 - (i % 2) * 3) + interval '8 hours') at time zone 'Africa/Douala',
            (array['Variables et types', 'TP : entrées-sorties', 'Conditions', 'TP : calcul de moyenne', 'Boucles for et while', 'TP : table de multiplication'])[i + 1],
            u_mbarga)
    returning id into sess;
    insert into public.attendance_records (session_id, student_id, status, method, marked_by)
    select sess, students[k],
           case substr(pattern[k], i + 1, 1) when 'p' then 'present' when 'a' then 'absent' when 'l' then 'late' else 'excused' end,
           case when k in (1, 3) and substr(pattern[k], i + 1, 1) = 'p' then 'code' else 'teacher' end,
           u_mbarga
    from generate_subscripts(students, 1) k;
  end loop;

  -- A few unread notifications so every role has something waiting
  insert into public.notifications (institution_id, user_id, course_id, kind, data, link, created_at)
  select v_inst, s, c_inf, 'grade',
         jsonb_build_object('course', 'INF101', 'title', 'Examen final INF101', 'score', g.score, 'points', 20),
         '/courses/' || c_inf || '/grades', now() - interval '3 hours'
  from unnest(students) s
  join public.grades g on g.student_id = s
  join public.assignments a on a.id = g.assignment_id and a.title = 'Examen final INF101';
  insert into public.notifications (institution_id, user_id, course_id, kind, data, link, created_at)
  select v_inst, s, c_inf, 'announcement',
         jsonb_build_object('course', 'INF101', 'title', 'Salle changée pour jeudi'),
         '/courses/' || c_inf || '/announcements', now() - interval '1 day'
  from unnest(students) s;
end
$seed$;
