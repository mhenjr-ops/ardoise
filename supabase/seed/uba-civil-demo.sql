-- University of Bamenda: a NAHPI Civil Engineering Level 200 class, for presentations.
--
-- The real first-semester load of the programme (12 courses, 35 credits, from a UBa
-- transcript), its lecturers, timetable and CA and examination marks, and the programme's
-- Year 1 and Year 2 courses in the catalogue. It shows the three ways a student lands in a
-- course: the year's registration (Form B, already processed for most of the class), joining
-- on their own by department and year, and uploading their own Form B.
--
-- Run after uba.sql, uba-demo.sql and the catalogue and Form B migrations. Safe to run twice
-- (does nothing the second time). The three accounts you sign in with use the same password
-- as admin.uba@demo.ardoise.cm (its hash is copied; no password is written here):
--   g.tabe@demo.ardoise.cm   TABE Gloria Enow, student UBA26E0412: full load, every mark in
--   r.fon@demo.ardoise.cm    FON Raoul Nkwain, student UBA26E0415: only the department's own
--                            courses until he uploads his Form B
--   e.tita@demo.ardoise.cm   Dr Ernest Tita, Civil Engineering lecturer (CVLE2101, CVLE2105)
-- Everyone else gets a random password nobody knows.

do $seed$
declare
  pw text;
  inst uuid;
  yr uuid;
  sem1 uuid;
  sem2 uuid;
  sem_end date;
  monday timestamp;
  civil uuid;
  prog uuid;
  dep uuid;
  uid uuid;
  cid uuid;
  catid uuid;
  ca uuid;
  ex uuid;
  total numeric;
  ca_score numeric;
  u jsonb;
  c jsonb;
  dp jsonb;
  slot jsonb;
  st record;
  ids jsonb := '{}'::jsonb;
  people constant jsonb := $json$[
    {"key": "tita", "email": "e.tita@demo.ardoise.cm", "name": "Dr Ernest Tita", "role": "teacher", "school": "NAHPI", "dept": "Civil Engineering and Architecture", "login": true},
    {"key": "nkwenti", "email": "uba.m.nkwenti@demo.ardoise.cm", "name": "Engr. Mary Nkwenti", "role": "teacher", "school": "NAHPI", "dept": "Civil Engineering and Architecture"},
    {"key": "fomba", "email": "uba.s.fomba@demo.ardoise.cm", "name": "Dr Samuel Fomba", "role": "teacher", "school": "NAHPI", "dept": "Civil Engineering and Architecture"},
    {"key": "ngum", "email": "uba.l.ngum@demo.ardoise.cm", "name": "Dr Lilian Ngum", "role": "teacher", "school": "NAHPI", "dept": "Computer Engineering"},
    {"key": "mbiydzenyuy", "email": "uba.h.mbiydzenyuy@demo.ardoise.cm", "name": "Dr Hilary Mbiydzenyuy", "role": "teacher", "school": "NAHPI", "dept": "Electrical and Electronics Engineering"},
    {"key": "ebai", "email": "uba.c.ebai@demo.ardoise.cm", "name": "Dr Clara Ebai", "role": "teacher", "school": "NAHPI", "dept": "Chemical and Biological Engineering"},
    {"key": "ateh", "email": "uba.b.ateh@demo.ardoise.cm", "name": "Mr Bernard Ateh", "role": "teacher", "school": "NAHPI", "dept": "Computer Engineering"},
    {"key": "asanji", "email": "uba.j.asanji@demo.ardoise.cm", "name": "Mrs Joy Asanji", "role": "teacher", "school": "FA", "dept": "English"},
    {"key": "ngombock", "email": "uba.o.ngombock@demo.ardoise.cm", "name": "Mme Odile Ngo Mbock", "role": "teacher", "school": "FA", "dept": "Bilingual and Translation Studies"},
    {"key": "ndze", "email": "uba.p.ndze@demo.ardoise.cm", "name": "Dr Peter Ndze", "role": "teacher", "school": "FA", "dept": "Philosophy"},
    {"key": "gloria", "email": "g.tabe@demo.ardoise.cm", "name": "TABE Gloria Enow", "role": "student", "matricule": "UBA26E0412", "registered": true, "login": true},
    {"key": "raoul", "email": "r.fon@demo.ardoise.cm", "name": "FON Raoul Nkwain", "role": "student", "matricule": "UBA26E0415", "registered": false, "login": true},
    {"key": "asong", "email": "uba.m.asong@demo.ardoise.cm", "name": "ASONG Melvis Bih", "role": "student", "matricule": "UBA26E0401", "registered": true, "ability": 72},
    {"key": "bate", "email": "uba.d.bate@demo.ardoise.cm", "name": "BATE Desmond Ayuk", "role": "student", "matricule": "UBA26E0403", "registered": true, "ability": 55},
    {"key": "chia", "email": "uba.p.chia@demo.ardoise.cm", "name": "CHIA Precious Lum", "role": "student", "matricule": "UBA26E0406", "registered": true, "ability": 64},
    {"key": "ebot", "email": "uba.i.ebot@demo.ardoise.cm", "name": "EBOT Ivan Tambe", "role": "student", "matricule": "UBA26E0408", "registered": true, "ability": 47},
    {"key": "fru", "email": "uba.n.fru@demo.ardoise.cm", "name": "FRU Nelly Akwi", "role": "student", "matricule": "UBA26E0409", "registered": true, "ability": 69},
    {"key": "mbuh", "email": "uba.c.mbuh@demo.ardoise.cm", "name": "MBUH Collins Tanyi", "role": "student", "matricule": "UBA26E0418", "registered": true, "ability": 58},
    {"key": "nde", "email": "uba.s.nde@demo.ardoise.cm", "name": "NDE Sylvie Manyi", "role": "student", "matricule": "UBA26E0421", "registered": true, "ability": 77},
    {"key": "nkwain", "email": "uba.b.nkwain@demo.ardoise.cm", "name": "NKWAIN Boris Fai", "role": "student", "matricule": "UBA26E0424", "registered": true, "ability": 51},
    {"key": "sama", "email": "uba.j.sama@demo.ardoise.cm", "name": "SAMA Joel Che", "role": "student", "matricule": "UBA26E0427", "registered": true, "ability": 62},
    {"key": "tatah", "email": "uba.f.tatah@demo.ardoise.cm", "name": "TATAH Faith Bongsiysi", "role": "student", "matricule": "UBA26E0430", "registered": true, "ability": 67}
  ]$json$;
  catalogue constant jsonb := $json$[
    {"code": "CHME2101", "title": "Chemistry for Engineers I", "level": 1, "semester": 1, "credits": 4, "deps": [["NAHPI", "Chemical and Biological Engineering"]]},
    {"code": "CVLE2101", "title": "Strength of Materials I", "level": 1, "semester": 1, "credits": 3, "deps": [["NAHPI", "Civil Engineering and Architecture"]]},
    {"code": "CVLE2102", "title": "Architectural Drawing I", "level": 1, "semester": 1, "credits": 4, "deps": [["NAHPI", "Civil Engineering and Architecture"]]},
    {"code": "CVLE2103", "title": "Mechanics I", "level": 1, "semester": 1, "credits": 2, "deps": [["NAHPI", "Civil Engineering and Architecture"]]},
    {"code": "CVLE2105", "title": "Descriptive Geometry", "level": 1, "semester": 1, "credits": 2, "deps": [["NAHPI", "Civil Engineering and Architecture"]]},
    {"code": "PHYE2101", "title": "Physics for Engineers I", "level": 1, "semester": 1, "credits": 4, "deps": [["NAHPI", "Electrical and Electronics Engineering"]]},
    {"code": "MATE2101", "title": "Engineering Mathematics 1", "level": 1, "semester": 1, "credits": 4, "deps": [["NAHPI", "Computer Engineering"]]},
    {"code": "COME2101", "title": "Introduction to Computer Science", "level": 1, "semester": 1, "credits": 4, "deps": [["NAHPI", "Computer Engineering"]]},
    {"code": "ENGE2101", "title": "Introduction to Engineering", "level": 1, "semester": 1, "credits": 2, "deps": [["NAHPI", "Civil Engineering and Architecture"]]},
    {"code": "FENG2101", "title": "Functional English I", "level": 1, "semester": 1, "credits": 2, "deps": []},
    {"code": "FFRE2101", "title": "Functional French I", "level": 1, "semester": 1, "credits": 2, "deps": []},
    {"code": "CVET2100", "title": "Civics and Ethics", "level": 1, "semester": 1, "credits": 2, "deps": []},
    {"code": "MATE2201", "title": "Engineering Mathematics 2", "level": 1, "semester": 2, "credits": 4, "deps": [["NAHPI", "Computer Engineering"]]},
    {"code": "COME2201", "title": "Algorithm and Programming Languages", "level": 1, "semester": 2, "credits": 4, "deps": [["NAHPI", "Computer Engineering"]]},
    {"code": "CHME2201", "title": "Chemistry for Engineers II", "level": 1, "semester": 2, "credits": 4, "deps": [["NAHPI", "Chemical and Biological Engineering"]]},
    {"code": "PHYE2201", "title": "Physics for Engineers II", "level": 1, "semester": 2, "credits": 4, "deps": [["NAHPI", "Electrical and Electronics Engineering"]]},
    {"code": "CVLE2201", "title": "Fluid Mechanics", "level": 1, "semester": 2, "credits": 3, "deps": [["NAHPI", "Civil Engineering and Architecture"]]},
    {"code": "CVLE2202", "title": "Engineering Thermodynamics", "level": 1, "semester": 2, "credits": 3, "deps": [["NAHPI", "Civil Engineering and Architecture"]]},
    {"code": "CVLE2203", "title": "Mechanics II", "level": 1, "semester": 2, "credits": 2, "deps": [["NAHPI", "Civil Engineering and Architecture"]]},
    {"code": "CVLE2204", "title": "Laboratory Practice I", "level": 1, "semester": 2, "credits": 4, "deps": [["NAHPI", "Civil Engineering and Architecture"]]},
    {"code": "CVLE2205", "title": "Strength of Materials II", "level": 1, "semester": 2, "credits": 2, "deps": [["NAHPI", "Civil Engineering and Architecture"]]},
    {"code": "CVLE2206", "title": "Industrial Attachment", "level": 1, "semester": 2, "credits": 1, "deps": [["NAHPI", "Civil Engineering and Architecture"]]},
    {"code": "CVLE2104", "title": "Material Science", "level": 1, "semester": 1, "credits": 2, "deps": [["NAHPI", "Civil Engineering and Architecture"]]},
    {"code": "FENG2202", "title": "Functional English II", "level": 1, "semester": 2, "credits": 2, "deps": []},
    {"code": "FFRE2202", "title": "Functional French II", "level": 1, "semester": 2, "credits": 2, "deps": []},
    {"code": "SPRTS100", "title": "Sports", "level": 1, "semester": 2, "credits": 0, "deps": [["FED", "Physical Education and Animation"]]},
    {"code": "CVLE3101", "title": "Theory of Structures I", "level": 2, "semester": 1, "credits": 4, "deps": [["NAHPI", "Civil Engineering and Architecture"]]},
    {"code": "CVLE3102", "title": "Surveying", "level": 2, "semester": 1, "credits": 3, "deps": [["NAHPI", "Civil Engineering and Architecture"]]},
    {"code": "CVLE3103", "title": "Applied Hydrology", "level": 2, "semester": 1, "credits": 3, "deps": [["NAHPI", "Civil Engineering and Architecture"]]},
    {"code": "CVLE3104", "title": "Earth Processes and Materials", "level": 2, "semester": 1, "credits": 4, "deps": [["NAHPI", "Civil Engineering and Architecture"]]},
    {"code": "CVLE3105", "title": "Civil Engineering Materials", "level": 2, "semester": 1, "credits": 3, "deps": [["NAHPI", "Civil Engineering and Architecture"]]},
    {"code": "CVLE3106", "title": "Reinforced Concrete Design I", "level": 2, "semester": 1, "credits": 3, "deps": [["NAHPI", "Civil Engineering and Architecture"]]},
    {"code": "CVLE3107", "title": "Computer Aided Design (CAD)", "level": 2, "semester": 1, "credits": 3, "deps": [["NAHPI", "Civil Engineering and Architecture"]]},
    {"code": "CVLE3108", "title": "Laboratory Practice II", "level": 2, "semester": 1, "credits": 4, "deps": [["NAHPI", "Civil Engineering and Architecture"]]},
    {"code": "MATE3101", "title": "Engineering Maths 3", "level": 2, "semester": 1, "credits": 4, "deps": [["NAHPI", "Computer Engineering"]]},
    {"code": "MATE3201", "title": "Engineering Maths 4", "level": 2, "semester": 2, "credits": 4, "deps": [["NAHPI", "Computer Engineering"]]},
    {"code": "CVLE3202", "title": "Architectural Drawing II", "level": 2, "semester": 2, "credits": 4, "deps": [["NAHPI", "Civil Engineering and Architecture"]]},
    {"code": "CVLE3203", "title": "Soil Mechanics I", "level": 2, "semester": 2, "credits": 4, "deps": [["NAHPI", "Civil Engineering and Architecture"]]},
    {"code": "CVLE3204", "title": "Concrete Technology", "level": 2, "semester": 2, "credits": 3, "deps": [["NAHPI", "Civil Engineering and Architecture"]]},
    {"code": "CVLE3205", "title": "Theory of Structures II", "level": 2, "semester": 2, "credits": 4, "deps": [["NAHPI", "Civil Engineering and Architecture"]]},
    {"code": "CVLE3206", "title": "Reinforced Concrete Design II", "level": 2, "semester": 2, "credits": 4, "deps": [["NAHPI", "Civil Engineering and Architecture"]]},
    {"code": "CVLE3207", "title": "Town Planning", "level": 2, "semester": 2, "credits": 2, "deps": [["NAHPI", "Civil Engineering and Architecture"]]},
    {"code": "CVLE3208", "title": "Laboratory Practice III", "level": 2, "semester": 2, "credits": 5, "deps": [["NAHPI", "Civil Engineering and Architecture"]]},
    {"code": "CVLE3209", "title": "Industrial Attachment II", "level": 2, "semester": 2, "credits": 2, "deps": [["NAHPI", "Civil Engineering and Architecture"]]}
  ]$json$;
  opened constant jsonb := $json$[
    {"code": "CHME2101", "teacher": "ebai", "offset": -4, "slots": [[0, 8, 2, "NAHPI Amphi 1"]], "about": "Atomic structure, bonding, stoichiometry, gases and solutions, and the chemistry of engineering materials."},
    {"code": "CVLE2101", "teacher": "tita", "offset": 0, "slots": [[0, 13, 2, "NAHPI Amphi 1"], [3, 8, 2, "Structures Lab"]], "about": "Stress and strain, axial loading, torsion, bending of beams and shear force and bending moment diagrams."},
    {"code": "CVLE2102", "teacher": "nkwenti", "offset": 5, "slots": [[1, 8, 3, "Drawing Studio"]], "about": "Drawing instruments and conventions, lettering, plans, sections and elevations of simple buildings."},
    {"code": "CVLE2103", "teacher": "fomba", "offset": -6, "slots": [[1, 13, 2, "NAHPI Amphi 2"]], "about": "Statics of particles and rigid bodies, equilibrium, trusses, friction and centroids."},
    {"code": "CVLE2105", "teacher": "tita", "offset": 3, "slots": [[2, 8, 2, "Drawing Studio"]], "about": "Orthographic projection, auxiliary views, intersections and developments of surfaces."},
    {"code": "PHYE2101", "teacher": "mbiydzenyuy", "offset": -5, "slots": [[2, 10, 2, "Physics Lab 1"]], "about": "Mechanics, oscillations and waves, heat and an introduction to electricity for engineers."},
    {"code": "MATE2101", "teacher": "ngum", "offset": -3, "slots": [[0, 10, 2, "NAHPI Amphi 1"], [3, 13, 2, "NAHPI Amphi 2"]], "about": "Functions, limits, differentiation and integration, complex numbers and matrices."},
    {"code": "COME2101", "teacher": "ateh", "offset": 4, "slots": [[2, 13, 2, "Computer Lab 3"]], "about": "Computer systems, number representation, operating systems, spreadsheets and a first programming language."},
    {"code": "ENGE2101", "teacher": "fomba", "offset": 6, "slots": [[4, 8, 2, "NAHPI Amphi 2"]], "about": "The engineering profession, design process, safety, ethics and technical communication."},
    {"code": "FENG2101", "teacher": "asanji", "offset": 2, "slots": [[4, 10, 2, "Amphi 600"]], "about": "Reading and writing for academic purposes, grammar in use, note-taking and summaries."},
    {"code": "FFRE2101", "teacher": "ngombock", "offset": -2, "slots": [[4, 13, 2, "Amphi 600"]], "about": "Communicative French: everyday situations, reading short texts and writing simple letters."},
    {"code": "CVET2100", "teacher": "ndze", "offset": 5, "slots": [[3, 15, 2, "Amphi 250"]], "about": "Citizenship, the Cameroonian constitution, public ethics and professional conduct."}
  ]$json$;
  marks constant jsonb := $json${"gloria": {"CHME2101": 68, "CVLE2101": 74, "CVLE2102": 81, "CVLE2103": 63, "CVLE2105": 77, "PHYE2101": 58, "MATE2101": 85, "COME2101": 72, "ENGE2101": 79, "FENG2101": 66, "FFRE2101": 54, "CVET2100": 70}, "raoul": {"CVLE2101": 61, "CVLE2102": 57, "CVLE2103": 46, "CVLE2105": 66, "ENGE2101": 72}}$json$;
begin
  select id into inst from public.institutions where slug = 'uba';
  if inst is null then
    raise notice 'Run uba.sql first.';
    return;
  end if;
  if exists (select 1 from auth.users where email = 'e.tita@demo.ardoise.cm') then
    raise notice 'UBa Civil Engineering class already loaded.';
    return;
  end if;
  select encrypted_password into pw from auth.users where email = 'admin.uba@demo.ardoise.cm';
  if pw is null then
    raise exception 'Load uba-demo.sql first: its administrator account gives the sign-in password.';
  end if;
  sem1 := public.current_semester(inst);
  select academic_year_id, coalesce(ends_on, (now() + interval '100 days')::date) into yr, sem_end from public.semesters where id = sem1;
  sem2 := public.catalogue_semester(inst, 2);
  monday := date_trunc('week', now() at time zone 'Africa/Douala');
  select d.id into civil from public.departments d join public.faculties f on f.id = d.faculty_id
  where d.institution_id = inst and f.code = 'NAHPI' and d.name = 'Civil Engineering and Architecture';
  if civil is null then
    raise exception 'NAHPI Civil Engineering and Architecture is missing from the structure.';
  end if;

  select id into prog from public.programmes where institution_id = inst and department_id = civil and code = 'CVLE';
  if prog is null then
    insert into public.programmes (institution_id, department_id, name, code, cycle)
    values (inst, civil, 'B.Eng. Civil Engineering and Architecture', 'CVLE', 'licence') returning id into prog;
  end if;

  -- The catalogue: the programme's Year 1 and Year 2 courses, with their credits.
  for c in select * from jsonb_array_elements(catalogue) loop
    insert into public.catalogue_courses (institution_id, code, title, level, semester_no, credits, source)
    values (inst, c ->> 'code', c ->> 'title', (c ->> 'level')::int, (c ->> 'semester')::int, (c ->> 'credits')::numeric, 'import')
    on conflict (institution_id, (upper(code))) do update
      set title = excluded.title, level = excluded.level, semester_no = excluded.semester_no, credits = excluded.credits
    returning id into catid;
    for dp in select * from jsonb_array_elements(c -> 'deps') loop
      insert into public.catalogue_course_departments (catalogue_id, department_id)
      select catid, d.id from public.departments d join public.faculties f on f.id = d.faculty_id
      where d.institution_id = inst and f.code = dp ->> 0 and d.name = dp ->> 1
      on conflict do nothing;
    end loop;
  end loop;

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
      case when (u ->> 'login')::boolean then pw else extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')) end, now(),
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
    if u ->> 'role' = 'teacher' then
      select d.id into dep from public.departments d join public.faculties f on f.id = d.faculty_id
      where d.institution_id = inst and f.code = u ->> 'school' and d.name = u ->> 'dept';
      insert into public.memberships (institution_id, user_id, role, department_id) values (inst, uid, 'teacher', dep);
    else
      insert into public.memberships (institution_id, user_id, role) values (inst, uid, 'student');
      insert into public.student_roster (institution_id, matricule, full_name, email, programme, level, claimed_by, claimed_at)
      values (inst, u ->> 'matricule', u ->> 'name', u ->> 'email', 'B.Eng. Civil Engineering and Architecture', '200', uid, now());
      -- Most of the class: the year's registration (their Form B) is already in.
      if (u ->> 'registered')::boolean then
        insert into public.roster_courses (roster_id, institution_id, course_code, semester_id)
        select r.id, inst, cc.code, public.catalogue_semester(inst, cc.semester_no)
        from public.student_roster r
        join public.catalogue_courses cc on cc.institution_id = inst and cc.level = 1
          and cc.code in (select x ->> 'code' from jsonb_array_elements(catalogue) x where (x ->> 'level')::int = 1)
        where r.institution_id = inst and r.claimed_by = uid
        on conflict do nothing;
      end if;
      insert into public.programme_enrollments (institution_id, programme_id, academic_year_id, level, student_id)
      values (inst, prog, yr, '200', uid);
    end if;
  end loop;

  -- The first semester's courses, opened by their lecturers. The registered students join from
  -- their registration; Raoul joins the Civil Engineering ones on his own.
  for c in select * from jsonb_array_elements(opened) loop
    select id into catid from public.catalogue_courses where institution_id = inst and code = c ->> 'code';
    select m.department_id into dep from public.memberships m
    where m.user_id = (ids ->> (c ->> 'teacher'))::uuid and m.institution_id = inst;
    insert into public.courses (institution_id, code, title, description, syllabus, language, level, department_id, semester_id,
                                catalogue_id, component_weights, created_by)
    select inst, cc.code, cc.title, c ->> 'about',
           (c ->> 'about') || E'\n\nAssessment\nContinuous assessment (CA) 30 %, end-of-semester examination 70 %.',
           'en', '200', case when cc.code ~ '^(FENG|FFRE|CVET)' then null else dep end, sem1, cc.id,
           '{"cc": 30, "exam": 70}'::jsonb, (ids ->> (c ->> 'teacher'))::uuid
    from public.catalogue_courses cc where cc.id = catid
    returning id into cid;
    ids := ids || jsonb_build_object(c ->> 'code', cid);
    insert into public.enrollments (institution_id, course_id, user_id, role)
    values (inst, cid, (ids ->> (c ->> 'teacher'))::uuid, 'teacher')
    on conflict (course_id, user_id) do update set role = 'teacher', added_by = null;

    for slot in select * from jsonb_array_elements(c -> 'slots') loop
      insert into public.calendar_events (institution_id, course_id, title, kind, location, starts_at, ends_at, repeat_weekly_until, created_by)
      values (inst, cid, (c ->> 'code') || ' ' || (select title from public.courses where id = cid), 'class', slot ->> 3,
              (monday + make_interval(days => (slot ->> 0)::int, hours => (slot ->> 1)::int)) at time zone 'Africa/Douala',
              (monday + make_interval(days => (slot ->> 0)::int, hours => (slot ->> 1)::int + (slot ->> 2)::int)) at time zone 'Africa/Douala',
              sem_end, (ids ->> (c ->> 'teacher'))::uuid);
    end loop;
    insert into public.announcements (course_id, title, body, author_id)
    values (cid, 'Welcome to ' || (c ->> 'code'),
            'Welcome. The course outline is under Syllabus and our hall is on the timetable. CA counts for 30 % and the examination for 70 %.',
            (ids ->> (c ->> 'teacher'))::uuid);

    -- CA and examination, marked.
    insert into public.assignments (course_id, title, description, due_at, points_possible, component, weight, published, created_by)
    values (cid, 'Continuous assessment (CA)', 'Class test and assignments, out of 30.', now() - interval '12 days', 30, 'cc', 1, true,
            (ids ->> (c ->> 'teacher'))::uuid)
    returning id into ca;
    insert into public.assignments (course_id, title, description, due_at, points_possible, component, weight, published, created_by)
    values (cid, 'First semester examination', 'Written examination, out of 70.', now() - interval '2 days', 70, 'exam', 1, true,
            (ids ->> (c ->> 'teacher'))::uuid)
    returning id into ex;
    for st in
      select e.user_id, p ->> 'key' as key, coalesce((p ->> 'ability')::numeric, 60) as ability
      from public.enrollments e
      join jsonb_array_elements(people) p on (ids ->> (p ->> 'key'))::uuid = e.user_id
      where e.course_id = cid and e.role = 'student'
    loop
      total := coalesce((marks -> st.key ->> (c ->> 'code'))::numeric,
                        least(92, greatest(28, st.ability + (c ->> 'offset')::numeric + (abs(hashtext(st.key || (c ->> 'code'))) % 15) - 7)));
      ca_score := least(30, greatest(0, round(total * 0.3 + ((abs(hashtext(st.key || 'ca' || (c ->> 'code'))) % 5) - 2))));
      insert into public.grades (institution_id, course_id, assignment_id, student_id, score, graded_by)
      values (inst, cid, ca, st.user_id, ca_score, (ids ->> (c ->> 'teacher'))::uuid),
             (inst, cid, ex, st.user_id, least(70, greatest(0, total - ca_score)), (ids ->> (c ->> 'teacher'))::uuid);
    end loop;
  end loop;

  -- What seeding just told them (welcome, new work, marks) is old news: they are new accounts.
  update public.notifications set read_at = now()
  where read_at is null and user_id in (select value::text::uuid from jsonb_each_text(ids) where key in
    (select p ->> 'key' from jsonb_array_elements(people) p));
end
$seed$;
