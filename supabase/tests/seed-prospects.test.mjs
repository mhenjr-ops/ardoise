// Runs supabase/seed/prospects.sql (universities prepared before they sign) twice.
import { readFileSync } from 'node:fs';
import { setup } from './harness.mjs';

const { db, check, done } = await setup([]);
const seed = readFileSync(new URL('../seed/prospects.sql', import.meta.url), 'utf8');
const declared = JSON.parse(seed.split('$json$')[1]);
const want = {
  universities: declared.length,
  units: declared.reduce((n, u) => n + u.units.length, 0),
  departments: declared.reduce((n, u) => n + u.units.reduce((m, f) => m + f.departments.length, 0), 0),
  programmes: declared.reduce(
    (n, u) => n + u.units.reduce((m, f) => m + f.departments.reduce((k, d) => k + (d.programmes?.length ?? 0), 0), 0), 0),
};
const n = async (sql) => Number((await db.query(sql)).rows[0].n);
const counts = async () => ({
  universities: await n(`select count(*) n from public.institutions where status = 'prospect'`),
  units: await n(`select count(*) n from public.faculties`),
  departments: await n(`select count(*) n from public.departments where faculty_id is not null`),
  programmes: await n(`select count(*) n from public.programmes where department_id is not null`),
});

await db.exec(seed);
const first = await counts();
check(`${want.universities} universities, all prospects`, first.universities === want.universities && want.universities === 14);
check(`every faculty, school, department and programme it lists (${want.units}/${want.departments}/${want.programmes})`,
  JSON.stringify(first) === JSON.stringify(want));
check('every one is marked unconfirmed, with where it came from',
  (await n(`select count(*) n from public.institutions where structure_confirmed_at is null and structure_source like 'https://%'`)) === 14);
check('none of them is on the sign-up list', (await n(`select count(*) n from public.school_directory()`)) === 0);
check('each has faculties or schools',
  (await n(`select count(*) n from public.institutions i where not exists (select 1 from public.faculties f where f.institution_id = i.id)`)) === 0);
check('same-named departments stay in their own faculty (Computer Engineering at Buea)',
  (await n(`select count(*) n from public.departments d join public.institutions i on i.id = d.institution_id where i.slug = 'ub' and d.name = 'Computer Engineering'`)) === 2);
check('French universities are set up in French',
  (await n(`select count(*) n from public.institutions where default_locale = 'fr'`)) === 6);

await db.exec(seed);
check('running it again adds nothing', JSON.stringify(await counts()) === JSON.stringify(want));

// Once a university has checked its structure, the seed leaves it alone.
await db.exec(`
  delete from public.departments where name = 'Veterinary Medicine';
  update public.institutions set structure_confirmed_at = now() where slug = 'ub';
`);
await db.exec(seed);
check('a confirmed university is not touched again',
  (await n(`select count(*) n from public.departments where name = 'Veterinary Medicine'`)) === 0);
done();
