// Sprint 2 checks: quiz engine and LMD deliberation workflow.
import { setup } from './harness.mjs';

const { db, ids, as, check, expectError, done, fail, createSchool } = await setup(['A', 'T', 'S1', 'S2', 'X', 'P']);

try {
  // ----- School, course, people -----
  const inst = await createSchool('A', 'Institut Démo', 'demo');
  for (const [email, role] of [['t@demo.cm', 'teacher'], ['s1@demo.cm', 'student'], ['s2@demo.cm', 'student']]) {
    await as('A', `select public.add_member_by_email($1, $2, $3)`, [inst, email, role]);
  }
  const policy = await as('A', `select pass_mark from public.grading_policies where institution_id = $1`, [inst]);
  check('default grading policy created with the institution', Number(policy.rows[0]?.pass_mark) === 10);

  const course = (await as('A', `insert into public.courses (institution_id, code, title) values ($1, 'INF101', 'Algo') returning id`, [inst])).rows[0].id;
  await as('A', `select public.enroll_by_email($1, 't@demo.cm', 'teacher')`, [course]);
  await as('T', `select public.enroll_by_email($1, 's1@demo.cm', 'student')`, [course]);
  await as('T', `select public.enroll_by_email($1, 's2@demo.cm', 'student')`, [course]);

  // ----- Question bank -----
  const bank = (await as('T', `insert into public.question_banks (course_id, title) values ($1, 'Chapitre 1') returning id`, [course])).rows[0].id;
  const qdefs = [
    ['single', 'Capitale du Cameroun ?', [{ id: 'a', text: 'Yaoundé' }, { id: 'b', text: 'Douala' }], 2, '"a"'],
    ['multiple', 'Nombres pairs ?', [{ id: 'a', text: '2' }, { id: 'b', text: '3' }, { id: 'c', text: '4' }], 2, '["a","c"]'],
    ['true_false', '2 + 2 = 4', [], 2, 'true'],
    ['numeric', 'Valeur de pi (2 décimales)', [], 2, '{"value": 3.14, "tolerance": 0.01}'],
    ['short', 'Ville du port autonome ?', [], 2, '["Douala"]'],
    ['essay', 'Expliquez une boucle while.', [], 4, null],
  ];
  const q = {};
  for (const [qtype, prompt, options, points, key] of qdefs) {
    const id = (await as('T', `insert into public.questions (bank_id, qtype, prompt, options, points) values ($1, $2, $3, $4, $5) returning id`, [bank, qtype, prompt, JSON.stringify(options), points])).rows[0].id;
    q[qtype] = id;
    await as('T', `insert into public.question_keys (question_id, correct) values ($1, $2::jsonb)`, [id, key]);
  }
  check('teacher wrote 6 questions', Object.keys(q).length === 6);
  check('student sees no questions before an attempt', (await as('S1', `select id from public.questions`)).rows.length === 0);
  check('student never sees answer keys', (await as('S1', `select * from public.question_keys`)).rows.length === 0);

  // ----- Quiz -----
  const asg = (await as('T', `insert into public.assignments (course_id, title, points_possible, component, submission_types) values ($1, 'Quiz 1', 20, 'cc', '{quiz}') returning id`, [course])).rows[0].id;
  const quiz = (await as('T', `insert into public.quizzes (assignment_id, bank_id, attempts_allowed, time_limit_minutes) values ($1, $2, 2, 10) returning id`, [asg, bank])).rows[0].id;
  await expectError('teacher cannot start a quiz', () => as('T', `select public.start_quiz_attempt($1)`, [quiz]), 'forbidden');
  await expectError('outsider cannot see the quiz', async () => {
    const r = await as('X', `select id from public.quizzes`);
    if (r.rows.length === 0) throw new Error('hidden by RLS');
  });

  const att1 = (await as('S1', `select public.start_quiz_attempt($1) id`, [quiz])).rows[0].id;
  const again = (await as('S1', `select public.start_quiz_attempt($1) id`, [quiz])).rows[0].id;
  check('starting again resumes the open attempt', again === att1);
  const row1 = (await as('S1', `select question_ids, deadline_at, max_score, option_orders from public.quiz_attempts where id = $1`, [att1])).rows[0];
  check('attempt draws all 6 questions with a deadline', row1.question_ids.length === 6 && row1.deadline_at !== null);
  check('max score is 14 points', Number(row1.max_score) === 14);
  check('option order shuffled per question', Object.keys(row1.option_orders).length === 2);
  check('student now sees the 6 questions', (await as('S1', `select id from public.questions`)).rows.length === 6);
  check('…but still no keys', (await as('S1', `select * from public.question_keys`)).rows.length === 0);

  const good = {
    [q.single]: 'a',
    [q.multiple]: ['c', 'a'],
    [q.true_false]: true,
    [q.numeric]: '3,14',
    [q.short]: '  douala ',
    [q.essay]: 'Une boucle while répète tant que la condition est vraie.',
    'not-a-question': 'ignored',
  };
  await as('S1', `select public.save_quiz_answers($1, $2::jsonb)`, [att1, JSON.stringify(good)]);
  const saved = (await as('S1', `select answers from public.quiz_attempts where id = $1`, [att1])).rows[0].answers;
  check('autosave keeps only real question ids', Object.keys(saved).length === 6 && !('not-a-question' in saved));

  await expectError('student cannot write the attempt directly', async () => {
    const r = await as('S1', `update public.quiz_attempts set score = 999 where id = $1 returning id`, [att1]);
    if (r.rows.length === 0) throw new Error('blocked by RLS');
  });
  await expectError('S2 cannot save into S1 attempt', () => as('S2', `select public.save_quiz_answers($1, '{}'::jsonb)`, [att1]), 'forbidden');

  const keysBefore = (await as('S1', `select public.quiz_attempt_review($1) r`, [att1])).rows[0].r;
  check('review hides keys before submission', keysBefore.show_keys === false && keysBefore.questions.every((x) => x.correct === null));

  await as('S1', `select public.submit_quiz_attempt($1, null)`, [att1]);
  const sub1 = (await as('S1', `select score, needs_review, auto_points from public.quiz_attempts where id = $1`, [att1])).rows[0];
  check('auto-marking: 10/10 objective points', Number(sub1.score) === 10);
  check('essay flags the attempt for review', sub1.needs_review === true);
  let grade = (await as('S1', `select score from public.grades where assignment_id = $1`, [asg])).rows[0];
  check('grade written and scaled to /20 (10/14 → 14.29)', Number(grade.score) === 14.29);

  const review = (await as('S1', `select public.quiz_attempt_review($1) r`, [att1])).rows[0].r;
  check('after submission the student sees the keys', review.show_keys === true && review.questions.find((x) => x.id === q.single).correct === 'a');
  await expectError('saving after submission fails', () => as('S1', `select public.save_quiz_answers($1, '{}'::jsonb)`, [att1]), 'already_submitted');

  await expectError('student cannot mark own essay', () => as('S1', `select public.grade_quiz_question($1, $2, 4)`, [att1, q.essay]), 'forbidden');
  await expectError('teacher cannot give more than the question is worth', () => as('T', `select public.grade_quiz_question($1, $2, 5)`, [att1, q.essay]), 'invalid');
  await as('T', `select public.grade_quiz_question($1, $2, 3)`, [att1, q.essay]);
  grade = (await as('S1', `select score from public.grades where assignment_id = $1`, [asg])).rows[0];
  check('essay mark updates the grade (13/14 → 18.57)', Number(grade.score) === 18.57);
  const audit = (await as('T', `select changed_by from public.mark_audit_log where assignment_id = $1 order by id`, [asg])).rows;
  check('audit: auto mark has no author, teacher mark is attributed', audit[0].changed_by === null && audit.at(-1).changed_by === ids.T);

  // Second attempt with wrong answers: best score is kept
  const att2 = (await as('S1', `select public.start_quiz_attempt($1) id`, [quiz])).rows[0].id;
  check('second attempt is a new attempt', att2 !== att1);
  await as('S1', `select public.submit_quiz_attempt($1, $2::jsonb)`, [att2, JSON.stringify({ [q.single]: 'b' })]);
  grade = (await as('S1', `select score from public.grades where assignment_id = $1`, [asg])).rows[0];
  check('weaker second attempt keeps the best grade', Number(grade.score) === 18.57);
  await expectError('third attempt refused', () => as('S1', `select public.start_quiz_attempt($1)`, [quiz]), 'no_attempts_left');

  // Time limit
  const att3 = (await as('S2', `select public.start_quiz_attempt($1) id`, [quiz])).rows[0].id;
  await db.query(`update public.quiz_attempts set deadline_at = now() - interval '2 minutes' where id = $1`, [att3]);
  const late = (await as('S2', `select public.save_quiz_answers($1, '{}'::jsonb) r`, [att3])).rows[0].r;
  check('saving after the time limit reports time_up', late.status === 'time_up');
  const closed = (await as('S2', `select submitted_at from public.quiz_attempts where id = $1`, [att3])).rows[0];
  check('expired attempt was submitted automatically', closed.submitted_at !== null);
  check('S2 cannot read S1 attempts', (await as('S2', `select id from public.quiz_attempts where student_id = $1`, [ids.S1])).rows.length === 0);
  await expectError('question used in an attempt cannot be deleted', () => as('T', `delete from public.questions where id = $1`, [q.single]), 'question_in_use');

  // ----- LMD structure (set up by the Ardoise team) -----
  await db.query('insert into public.platform_admins (user_id) values ($1)', [ids.P]);
  await expectError('a school owner cannot build the structure (the Ardoise team does)',
    () => as('A', `insert into public.faculties (institution_id, name) values ($1, 'X')`, [inst]), 'row-level security');
  const fac = (await as('P', `insert into public.faculties (institution_id, name) values ($1, 'Sciences') returning id`, [inst])).rows[0].id;
  const dep = (await as('P', `insert into public.departments (institution_id, faculty_id, name) values ($1, $2, 'Informatique') returning id`, [inst, fac])).rows[0].id;
  const prog = (await as('P', `insert into public.programmes (institution_id, department_id, name, code) values ($1, $2, 'Licence Informatique', 'LINF') returning id`, [inst, dep])).rows[0].id;
  const year = (await as('P', `insert into public.academic_years (institution_id, label, is_current) values ($1, '2026-2027', true) returning id`, [inst])).rows[0].id;
  const sem = (await as('P', `insert into public.semesters (institution_id, academic_year_id, label) values ($1, $2, 'S1') returning id`, [inst, year])).rows[0].id;
  const ue1 = (await as('P', `insert into public.teaching_units (institution_id, programme_id, semester_id, code, title, credits, level) values ($1, $2, $3, 'UE11', 'Programmation', 6, 'L1') returning id`, [inst, prog, sem])).rows[0].id;
  await expectError('teacher cannot attach the course to a UE', () => as('T', `update public.courses set teaching_unit_id = $2 where id = $1`, [course, ue1]), 'forbidden');
  await expectError('teacher cannot change the coefficient', () => as('T', `update public.courses set coefficient = 3 where id = $1`, [course]), 'forbidden');
  await as('T', `update public.courses set description = 'ok' where id = $1`, [course]);
  check('teacher can still edit the description', true);
  await as('A', `update public.courses set teaching_unit_id = $2, semester_id = $3, coefficient = 2 where id = $1`, [course, ue1, sem]);
  check('admin attaches course to UE with coefficient 2', Number((await as('A', `select coefficient from public.courses where id = $1`, [course])).rows[0].coefficient) === 2);

  const reg = (await as('A', `select public.register_students($1, $2, 'L1', array['s1@demo.cm', 'S2@demo.cm ', 'ghost@demo.cm']) r`, [prog, year])).rows[0].r;
  check('register_students adds 2 and reports the unknown email', reg.added === 2 && reg.not_found[0] === 'ghost@demo.cm');
  await expectError('teacher cannot register students', () => as('T', `select public.register_students($1, $2, 'L1', array['s1@demo.cm'])`, [prog, year]), 'forbidden');
  check('student sees own programme enrollment only', (await as('S1', `select student_id from public.programme_enrollments`)).rows.every((r) => r.student_id === ids.S1));

  // ----- Deliberation -----
  const delib = (await as('A', `insert into public.deliberations (programme_id, semester_id, level) values ($1, $2, 'L1') returning id, status`, [prog, sem])).rows[0];
  check('deliberation starts as draft', delib.status === 'draft');
  check('teacher cannot see deliberations', (await as('T', `select id from public.deliberations`)).rows.length === 0);
  const ueResults = JSON.stringify([{ ue_id: ue1, code: 'UE11', credits: 6, mark: 12.5, final: 13, status: 'validated' }]);
  await as('A', `insert into public.deliberation_results (deliberation_id, student_id, student_name, ue_results, semester_average, credits_earned, credits_total, decision) values ($1, $2, 'User S1', $3::jsonb, 13, 6, 6, 'admitted')`, [delib.id, ids.S1, ueResults]);
  await as('A', `insert into public.deliberation_results (deliberation_id, student_id, student_name, ue_results, semester_average, credits_earned, credits_total, decision) values ($1, $2, 'User S2', '[]', 8, 0, 6, 'resit')`, [delib.id, ids.S2]);
  await as('A', `insert into public.jury_adjustments (deliberation_id, student_id, teaching_unit_id, bonus, reason) values ($1, $2, $3, 0.5, 'Assiduité exemplaire')`, [delib.id, ids.S1, ue1]);
  const adj = (await as('A', `select adjusted_by from public.jury_adjustments`)).rows[0];
  check('jury adjustment is logged with its author', adj.adjusted_by === ids.A);
  await expectError('jury bonus above the policy cap refused', () => as('A', `insert into public.jury_adjustments (deliberation_id, student_id, teaching_unit_id, bonus, reason) values ($1, $2, $3, 3, 'Trop')`, [delib.id, ids.S2, ue1]), 'bonus_too_high');
  await expectError('cannot publish straight from draft', () => as('A', `update public.deliberations set status = 'published' where id = $1`, [delib.id]), 'must_lock_first');
  check('results hidden from students while draft', (await as('S1', `select id from public.deliberation_results`)).rows.length === 0);

  await as('A', `update public.deliberations set status = 'locked' where id = $1`, [delib.id]);
  await expectError('locked: results frozen', () => as('A', `update public.deliberation_results set decision = 'admitted' where student_id = $1`, [ids.S2]), 'deliberation_locked');
  await expectError('locked: no new jury adjustments', () => as('A', `insert into public.jury_adjustments (deliberation_id, student_id, teaching_unit_id, bonus, reason) values ($1, $2, $3, 0.5, 'x y z')`, [delib.id, ids.S2, ue1]), 'deliberation_locked');
  await expectError('locked: deliberation cannot be deleted', () => as('A', `delete from public.deliberations where id = $1`, [delib.id]), 'deliberation_locked');
  await expectError('transcript refused before publication', () => as('A', `insert into public.transcripts (deliberation_id, student_id, payload) values ($1, $2, '{}')`, [delib.id, ids.S1]), 'deliberation_not_published');

  await as('A', `update public.deliberations set status = 'published' where id = $1`, [delib.id]);
  const mine = (await as('S1', `select student_id, decision from public.deliberation_results`)).rows;
  check('after publication S1 sees only own result', mine.length === 1 && mine[0].decision === 'admitted');
  check('S1 can read the published deliberation', (await as('S1', `select status from public.deliberations`)).rows[0]?.status === 'published');
  await expectError('published deliberation cannot be reopened', () => as('A', `update public.deliberations set status = 'draft' where id = $1`, [delib.id]), 'deliberation_published');

  const tr = (await as('A', `insert into public.transcripts (deliberation_id, student_id, payload) values ($1, $2, $3::jsonb) returning verification_code`, [delib.id, ids.S1, JSON.stringify({ student: 'User S1', average: 13, decision: 'admitted' })])).rows[0];
  check('transcript gets a 16-character code', /^[0-9A-F]{16}$/.test(tr.verification_code));
  const verified = (await as(null, `select public.verify_transcript($1) v`, [tr.verification_code.toLowerCase()], 'anon')).rows[0].v;
  check('anyone can verify the QR code (anon)', verified?.payload?.decision === 'admitted' && verified.institution === 'Institut Démo');
  const bogus = (await as(null, `select public.verify_transcript('0000000000000000') v`, [], 'anon')).rows[0].v;
  check('unknown code verifies as nothing', bogus === null);
  await expectError('anon cannot list transcripts', () => as(null, `select * from public.transcripts`, [], 'anon'));
  check('S2 cannot read S1 transcript', (await as('S2', `select id from public.transcripts`)).rows.length === 0);
  await expectError('teacher cannot issue transcripts', () => as('T', `insert into public.transcripts (deliberation_id, student_id, payload) values ($1, $2, '{}')`, [delib.id, ids.S2]));

  // Draft deliberations can be deleted with their results
  const sem2 = (await as('P', `insert into public.semesters (institution_id, academic_year_id, label) values ($1, $2, 'S2') returning id`, [inst, year])).rows[0].id;
  const d2 = (await as('A', `insert into public.deliberations (programme_id, semester_id, level) values ($1, $2, 'L1') returning id`, [prog, sem2])).rows[0].id;
  await as('A', `insert into public.deliberation_results (deliberation_id, student_id, decision) values ($1, $2, 'incomplete')`, [d2, ids.S1]);
  await as('A', `delete from public.deliberations where id = $1`, [d2]);
  check('draft deliberation deleted with its results', (await as('A', `select id from public.deliberation_results where deliberation_id = $1`, [d2])).rows.length === 0);

  // Cross-tenant
  const instX = await createSchool('X', 'Other', 'other');
  check('X sees no deliberations of demo', (await as('X', `select id from public.deliberations`)).rows.length === 0);
  await expectError('X cannot register students in demo', () => as('X', `select public.register_students($1, $2, 'L1', array['s1@demo.cm'])`, [prog, year]), 'forbidden');
  await expectError('X cannot hang a UE on demo programme', () => as('X', `insert into public.teaching_units (institution_id, programme_id, code, title, credits) values ($1, $2, 'HACK', 'x', 1)`, [instX, prog]), 'invalid');
  await expectError('X cannot add teaching units even in its own school', () => as('X', `insert into public.teaching_units (institution_id, code, title, credits) values ($1, 'MINE', 'x', 1)`, [instX]), 'row-level security');
  await expectError('even the Ardoise team cannot hang one school\'s UE on another school\'s programme', () => as('P', `insert into public.teaching_units (institution_id, programme_id, code, title, credits) values ($1, $2, 'HACK', 'x', 1)`, [instX, prog]), 'invalid');
  check('X has its own policy', (await as('X', `select institution_id from public.grading_policies`)).rows.every((r) => r.institution_id === instX));
} catch (e) {
  console.log('UNEXPECTED ERROR:', e.message);
  fail();
}

done();
