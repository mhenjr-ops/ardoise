-- University of Bamenda (UBa): its faculties, schools, departments and programmes, as a
-- realistic school for presentations. Departments follow uniba.cm and nahpi.cm where they
-- list them; the rest follow the university's published admissions lists.
-- Run after the migrations. Safe to run twice: only what is missing is added.

do $seed$
declare
  structure constant jsonb := $json$[
    {"name": "Faculty of Arts", "code": "FA", "kind": "faculty", "departments": [
      {"name": "Bilingual and Translation Studies"},
      {"name": "Communication and Development Studies"},
      {"name": "English", "programmes": [{"name": "English Language"}, {"name": "Literature in English"}]},
      {"name": "Geography and Planning"},
      {"name": "History and Archaeology", "programmes": [{"name": "Economic and Social Development History"}]},
      {"name": "Linguistics and African Languages"},
      {"name": "Performing and Visual Arts", "programmes": [{"name": "Theatre, Television and Film Studies"}]},
      {"name": "Philosophy"},
      {"name": "Psychology"}]},
    {"name": "Faculty of Economics and Management Sciences", "code": "FEMS", "kind": "faculty", "departments": [
      {"name": "Accounting"}, {"name": "Banking and Finance"}, {"name": "Economics"},
      {"name": "Islamic Banking and Finance"}, {"name": "Management"}, {"name": "Marketing"}]},
    {"name": "Faculty of Education", "code": "FED", "kind": "faculty", "departments": [
      {"name": "Curriculum Planning and Design"}, {"name": "Educational Leadership"}, {"name": "Educational Psychology"},
      {"name": "Sports and Physical Education"}, {"name": "Teacher Education"}]},
    {"name": "Faculty of Health Sciences", "code": "FHS", "kind": "faculty", "departments": [
      {"name": "Medical Laboratory Science"}, {"name": "Medicine"}, {"name": "Nursing and Midwifery"}, {"name": "Pharmacy"}]},
    {"name": "Faculty of Law and Political Sciences", "code": "FLPS", "kind": "faculty", "departments": [
      {"name": "English Private Law"}, {"name": "French Private Law"}, {"name": "Political Science"}, {"name": "Public Law"}]},
    {"name": "Faculty of Science", "code": "FS", "kind": "faculty", "departments": [
      {"name": "Biochemistry"},
      {"name": "Chemistry"},
      {"name": "Geology, Mining and Environmental Science", "programmes": [{"name": "Geology"}, {"name": "Environmental Science"}]},
      {"name": "Mathematics and Computer Science", "programmes": [
        {"name": "Pure Mathematics"}, {"name": "Applied Mathematics"}, {"name": "Mathematics and Statistics"},
        {"name": "Mathematics (minor Computer Science)"}, {"name": "Combined Mathematics and Computer Science"},
        {"name": "Cybersecurity and Cryptology"}]},
      {"name": "Microbiology and Parasitology", "programmes": [{"name": "Microbiology (minor Medical Laboratory Technology)"}]},
      {"name": "Physics"},
      {"name": "Plant Sciences (Applied Botany)", "programmes": [{"name": "Applied Botany"}]},
      {"name": "Zoology", "programmes": [
        {"name": "Animal Biodiversity and Conservation"}, {"name": "Applied Zoology (minor Medical Laboratory Technology)"},
        {"name": "Applied Zoology (minor Animal Production)"}]}]},
    {"name": "College of Technology", "code": "COLTECH", "kind": "school", "departments": [
      {"name": "Agribusiness Technology"}, {"name": "Agricultural and Environmental Engineering"},
      {"name": "Animal Production Technology"}, {"name": "Computer Engineering"}, {"name": "Crop Production Technology"},
      {"name": "Electrical and Electronic Engineering"}, {"name": "Forestry and Wildlife Technology"},
      {"name": "Nutrition, Food and Bio-Resource Technology"}]},
    {"name": "Higher Institute of Commerce and Management", "code": "HICM", "kind": "school", "departments": [
      {"name": "Accounting and Finance"}, {"name": "Insurance and Security"}, {"name": "Management and Entrepreneurship"},
      {"name": "Marketing"}, {"name": "Money and Banking"}, {"name": "Organisational Sciences"}]},
    {"name": "Higher Institute of Transport and Logistics", "code": "HITL", "kind": "school", "departments": [
      {"name": "Air Transport"}, {"name": "Customs"}, {"name": "Land Transport"}, {"name": "Maritime Transport"},
      {"name": "Tourism and Hospitality Management"}, {"name": "Transit and Logistics"}]},
    {"name": "National Higher Polytechnic Institute", "code": "NAHPI", "kind": "school", "departments": [
      {"name": "Chemical and Biological Engineering"}, {"name": "Civil Engineering and Architecture"},
      {"name": "Computer Engineering"}, {"name": "Electrical and Electronics Engineering"},
      {"name": "Mechanical and Industrial Engineering"}, {"name": "Mining and Mineral Engineering"},
      {"name": "Petroleum Engineering"}]},
    {"name": "Higher Teacher Training College", "code": "HTTC", "kind": "school", "departments": []},
    {"name": "Higher Technical Teacher Training College", "code": "HTTTC", "kind": "school", "departments": []},
    {"name": "HND Programmes", "code": "HND", "kind": "school", "departments": [
      {"name": "Higher National Diploma", "programmes": [
        {"name": "Agriculture and Food Sciences", "code": "AFSH", "cycle": "hnd"},
        {"name": "Business, Finance and Management", "code": "BFM", "cycle": "hnd"},
        {"name": "Civil Engineering", "code": "CVEN", "cycle": "hnd"},
        {"name": "Computer Engineering", "code": "CME", "cycle": "hnd"},
        {"name": "Education", "code": "ED", "cycle": "hnd"},
        {"name": "Electrical and Electronic Engineering", "code": "EEEH", "cycle": "hnd"},
        {"name": "Forestry and Wildlife Technology", "code": "FWT", "cycle": "hnd"},
        {"name": "Home Economics and Social Work", "cycle": "hnd"},
        {"name": "Journalism and Media", "code": "JMH", "cycle": "hnd"},
        {"name": "Law", "code": "LL", "cycle": "hnd"},
        {"name": "Management", "code": "MANH", "cycle": "hnd"},
        {"name": "Mechanical Engineering", "code": "ME", "cycle": "hnd"},
        {"name": "Medical and Biomedical Sciences", "code": "MBSH", "cycle": "hnd"},
        {"name": "Thermal and Energy Engineering", "code": "TEE", "cycle": "hnd"},
        {"name": "Tourism Management", "code": "TM", "cycle": "hnd"},
        {"name": "Transport and Maritime Studies", "code": "TMS", "cycle": "hnd"},
        {"name": "Woodworks", "code": "WW", "cycle": "hnd"}]}]}
  ]$json$;
  inst uuid;
  u jsonb;
  d jsonb;
  p jsonb;
  fid uuid;
  did uuid;
  yid uuid;
begin
  select id into inst from public.institutions where slug = 'uba';
  if inst is null then
    insert into public.institutions (name, slug, default_locale) values ('University of Bamenda', 'uba', 'en')
    returning id into inst;
  end if;

  for u in select * from jsonb_array_elements(structure) loop
    select id into fid from public.faculties
    where institution_id = inst and (lower(code) = lower(u ->> 'code') or lower(name) = lower(u ->> 'name'))
    limit 1;
    if fid is null then
      insert into public.faculties (institution_id, name, code, kind)
      values (inst, u ->> 'name', u ->> 'code', u ->> 'kind') returning id into fid;
    else
      update public.faculties set name = u ->> 'name', code = u ->> 'code', kind = u ->> 'kind' where id = fid;
    end if;
    for d in select * from jsonb_array_elements(u -> 'departments') loop
      select id into did from public.departments
      where institution_id = inst and lower(name) = lower(d ->> 'name') and (faculty_id = fid or faculty_id is null)
      order by (faculty_id = fid) desc nulls last
      limit 1;
      if did is null then
        insert into public.departments (institution_id, faculty_id, name) values (inst, fid, d ->> 'name') returning id into did;
      else
        update public.departments set faculty_id = fid where id = did;
      end if;
      for p in select * from jsonb_array_elements(coalesce(d -> 'programmes', '[]'::jsonb)) loop
        if not exists (select 1 from public.programmes where department_id = did and lower(name) = lower(p ->> 'name')) then
          insert into public.programmes (institution_id, department_id, name, code, cycle)
          values (inst, did, p ->> 'name', p ->> 'code', coalesce(p ->> 'cycle', 'licence'));
        end if;
      end loop;
    end loop;
  end loop;

  -- The 2026-2027 academic year, in two semesters.
  select id into yid from public.academic_years where institution_id = inst and label = '2026-2027';
  if yid is null then
    insert into public.academic_years (institution_id, label, starts_on, ends_on, is_current)
    values (inst, '2026-2027', '2026-10-01', '2027-08-31', true) returning id into yid;
  end if;
  if not exists (select 1 from public.semesters where academic_year_id = yid) then
    insert into public.semesters (institution_id, academic_year_id, label, starts_on, ends_on) values
      (inst, yid, 'First Semester', '2026-10-01', '2027-02-28'),
      (inst, yid, 'Second Semester', '2027-03-01', '2027-08-31');
  end if;
end
$seed$;
