// Function execution after the lock-down migration.
import { setup } from './harness.mjs';

const { as, check, expectError, done } = await setup(['A']);
await expectError('signed-out visitor cannot create an institution',
  () => as(null, `select public.create_institution('X school', 'x-school')`, [], 'anon'));
await expectError('signed-out visitor cannot probe roles',
  () => as(null, `select public.has_inst_role(gen_random_uuid(), array['admin'])`, [], 'anon'));
const v = await as(null, `select public.verify_transcript('NOPE') as r`, [], 'anon');
check('signed-out visitor can still verify a transcript code', v.rows[0].r === null);
await expectError('signed-in user cannot call a trigger function directly',
  () => as('A', `select public.tg_handle_new_user()`));
const inst = await as('A', `select public.create_institution('Ecole A', 'ecole-a') as id`);
check('signed-in user can still create an institution (triggers still fire)', !!inst.rows[0].id);
done();
