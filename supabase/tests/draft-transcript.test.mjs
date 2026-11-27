// Draft transcript: a student gets only their own inputs, for their programme and year.
import { setup } from './harness.mjs';

const { db, ids, as, check, expectError, done, createSchool } = await setup(['A', 'S1', 'S2', 'X']);
const inst = await createSchool('A', 'Ecole A', 'ecole-a');
const q = async (sql, params = []) => (await db.query(sql, params)).rows;

const [prog] = await q(`insert into public.programmes (institution_id, name, code) values ($1, 'Licence Informatique', 'LINF') returning id`, [inst]);
const [oldYear] = await q(`insert into public.academic_years (institution_id, label, is_current, starts_on) values ($1, '2025-2026', false, '2025-10-01') returning id`, [inst]);
const [year] = await q(`insert into public.academic_years (institution_id, label, is_current, starts_on) values ($1, '2026-2027', true, '2026-10-01') returning id`, [inst]);
const [s1] = await q(`insert into public.semesters (institution_id, academic_year_id, label, starts_on) values ($1, $2, 'S1', '2026-10-01') returning id`, [inst, year.id]);
const [s2] = await q(`insert into public.semesters (institution_id, academic_year_id, label, starts_on) values ($1, $2, 'S2', '2027-02-01') returning id`, [inst, year.id]);
await q(`insert into public.semesters (institution_id, academic_year_id, label) values ($1, $2, 'S3 sans UE')`, [inst, year.id]);
const [ue1] = await q(`insert into public.teaching_units (institution_id, programme_id, semester_id, code, title, credits, level) values ($1, $2, $3, 'UE11', 'Programmation', 6, 'L1') returning id`, [inst, prog.id, s1.id]);
await q(`insert into public.teaching_units (institution_id, programme_id, semester_id, code, title, credits, level) values ($1, $2, $3, 'UE19', 'Autre niveau', 6, 'L2')`, [inst, prog.id, s1.id]);
const [ue2] = await q(`insert into public.teaching_units (institution_id, programme_id, semester_id, code, title, credits, level) values ($1, $2, $3, 'UE21', 'Réseaux', 4, 'L1') returning id`, [inst, prog.id, s2.id]);
const [c1] = await q(`insert into public.courses (institution_id, code, title, teaching_unit_id, coefficient) values ($1, 'INF101', 'Algo', $2, 2) returning id`, [inst, ue1.id]);
const [c2] = await q(`insert into public.courses (institution_id, code, title, teaching_unit_id) values ($1, 'NET201', 'Réseaux', $2) returning id`, [inst, ue2.id]);
const [a1] = await q(`insert into public.assignments (course_id, title, points_possible, component, published) values ($1, 'Partiel', 20, 'exam', true) returning id`, [c1.id]);
const [hidden] = await q(`insert into public.assignments (course_id, title, points_possible, component, published) values ($1, 'Brouillon', 20, 'cc', false) returning id`, [c1.id]);
await q(`insert into public.grades (institution_id, course_id, assignment_id, student_id, score) values ($1, $2, $3, $4, 14), ($1, $2, $3, $5, 6), ($1, $2, $6, $4, 3)`,
  [inst, c1.id, a1.id, ids.S1, ids.S2, hidden.id]);
await q(`insert into public.programme_enrollments (institution_id, programme_id, academic_year_id, level, student_id) values ($1, $2, $3, 'L1', $4), ($1, $2, $5, 'L1', $4), ($1, $2, $3, 'L1', $6)`,
  [inst, prog.id, year.id, ids.S1, oldYear.id, ids.S2]);
await q(`insert into public.student_roster (institution_id, matricule, full_name, claimed_by) values ($1, 'ISDY26A001', 'User S1', $2)`, [inst, ids.S1]);
// S2 is already officially deliberated in S2 (published).
const [d] = await q(`insert into public.deliberations (institution_id, programme_id, semester_id, level, status, published_at) values ($1, $2, $3, 'L1', 'draft', now()) returning id`, [inst, prog.id, s2.id]);
await q(`insert into public.deliberation_results (institution_id, deliberation_id, student_id, student_name, ue_results, semester_average, credits_earned, credits_total, decision) values ($1, $2, $3, 'User S1', '[]', 12.5, 4, 4, 'admitted')`, [inst, d.id, ids.S1]);
await q(`update public.deliberations set status = 'locked' where id = $1`, [d.id]);
await q(`update public.deliberations set status = 'published' where id = $1`, [d.id]);

await expectError('a signed-out visitor gets nothing', () => as(null, `select public.draft_transcript_data()`, [], 'anon'));
const r = (await as('S1', `select public.draft_transcript_data() as d`)).rows[0].d;
check('the current year is used', r.academic_year === '2026-2027' && r.level === 'L1' && r.programme.code === 'LINF');
check('it carries the student\'s name and matricule', r.student.full_name === 'User S1' && r.student.matricule === 'ISDY26A001');
check('only semesters with teaching units, in order', r.semesters.map((s) => s.label).join(',') === 'S1,S2');
const sem1 = r.semesters[0];
check('only teaching units of the student\'s level', sem1.ues.map((u) => u.code).join(',') === 'UE11');
check('unpublished assignments are left out', sem1.assignments.length === 1 && sem1.assignments[0].id === a1.id);
check('only the student\'s own marks, on published work', sem1.grades.length === 1 && Number(sem1.grades[0].score) === 14);
check('a semester the jury has published comes with the official result', r.semesters[1].published?.decision === 'admitted' && Number(r.semesters[1].published.semester_average) === 12.5);
check('a semester not yet deliberated has no official result', sem1.published === null);
check('the grading policy comes along', Number(r.policy.pass_mark) === 10 && !('institution_id' in r.policy));
const r2 = (await as('S2', `select public.draft_transcript_data() as d`)).rows[0].d;
check('another student sees their own mark only', r2.semesters[0].grades.length === 1 && Number(r2.semesters[0].grades[0].score) === 6);
check('and not someone else\'s published result', r2.semesters[1].published === null);
const rx = (await as('X', `select public.draft_transcript_data() as d`)).rows[0].d;
check('someone not registered in a programme gets nothing', rx === null);
done();
