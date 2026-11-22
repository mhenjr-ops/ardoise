// Runs supabase/seed/uba.sql (the University of Bamenda's structure) twice.
import { readFileSync } from 'node:fs';
import { setup } from './harness.mjs';

const { db, check, done } = await setup([]);
const seed = readFileSync(new URL('../seed/uba.sql', import.meta.url), 'utf8');
await db.exec(seed);
const n = async (sql) => Number((await db.query(sql)).rows[0].n);
const inst = `(select id from public.institutions where slug = 'uba')`;
check('13 faculties, schools and institutes', (await n(`select count(*) n from public.faculties where institution_id = ${inst}`)) === 13);
check('6 faculties and 7 schools', (await n(`select count(*) n from public.faculties where institution_id = ${inst} and kind = 'school'`)) === 7);
check('64 departments, all attached', (await n(`select count(*) n from public.departments where institution_id = ${inst} and faculty_id is not null`)) === 64);
check('34 programmes, 17 of them HND', (await n(`select count(*) n from public.programmes where institution_id = ${inst}`)) === 34
  && (await n(`select count(*) n from public.programmes where institution_id = ${inst} and cycle = 'hnd'`)) === 17);
check('same-named departments stay in their own school',
  (await n(`select count(*) n from public.departments d join public.faculties f on f.id = d.faculty_id where d.name = 'Computer Engineering'`)) === 2);
check('the current year has two semesters', (await n(`select count(*) n from public.semesters s join public.academic_years y on y.id = s.academic_year_id where y.is_current`)) === 2);
await db.exec(seed);
check('running it again adds nothing',
  (await n(`select count(*) n from public.departments where institution_id = ${inst}`)) === 64
  && (await n(`select count(*) n from public.programmes where institution_id = ${inst}`)) === 34
  && (await n(`select count(*) n from public.semesters`)) === 2);
done();
