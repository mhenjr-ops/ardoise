// Function execution after the lock-down migration.
import { setup } from './harness.mjs';

const { as, check, expectError, done, createSchool } = await setup(['A']);
await expectError('signed-out visitor cannot create an institution',
  () => as(null, `select public.create_institution('X school', 'x-school')`, [], 'anon'));
await expectError('signed-out visitor cannot probe roles',
  () => as(null, `select public.has_inst_role(gen_random_uuid(), array['admin'])`, [], 'anon'));
const v = await as(null, `select public.verify_transcript('NOPE') as r`, [], 'anon');
check('signed-out visitor can still verify a transcript code', v.rows[0].r === null);
await expectError('signed-in user cannot call a trigger function directly',
  () => as('A', `select public.tg_handle_new_user()`));
await expectError('an ordinary signed-in user cannot create a school',
  () => as('A', `select public.create_institution('Ecole A', 'ecole-a')`), 'forbidden');
const inst = await createSchool('A', 'Ecole A', 'ecole-a');
check('the Ardoise team can create a school (triggers still fire)', !!inst);
const pub = await as(null, `select string_agg(p.proname, ',' order by p.proname) as names
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`, [], 'anon');
check('signed-out visitors can only verify transcripts, preview invitations, request a demo and sign in with a matricule',
  pub.rows[0].names === 'invitation_preview,login_email,request_demo,verify_transcript');
done();
