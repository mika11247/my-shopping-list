-- Rollback-only checks for the isolated database.
BEGIN;
DO $$
DECLARE
  target uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  fixture_group uuid := gen_random_uuid();
  old_other_job uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
    (target,target || '@example.test',now()), (outsider,outsider || '@example.test',now());
  INSERT INTO public.groups(id,owner_user_id,name) VALUES (fixture_group,outsider,'Fixture');
  INSERT INTO public.group_members(group_id,user_id,role) VALUES (fixture_group,target,'member');
  INSERT INTO public.shopping_items(user_id,name) VALUES (target,'Must remain');
  BEGIN
    PERFORM public.begin_pilot_withdrawal(target,ARRAY[target],public.account_withdrawal_preview(target));
    RAISE EXCEPTION 'Shared membership was not rejected';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.shopping_items WHERE user_id=target)
    OR EXISTS (SELECT 1 FROM app_private.account_withdrawals WHERE user_id=target) THEN
    RAISE EXCEPTION 'Shared membership rejection modified data';
  END IF;
  INSERT INTO app_private.account_withdrawals(id,stage,completed_at)
  VALUES (old_other_job,'complete',now()-interval '31 days');
  PERFORM public.claim_pilot_withdrawal(ARRAY[target],gen_random_uuid());
  IF NOT EXISTS (SELECT 1 FROM app_private.account_withdrawals WHERE id=old_other_job)
    OR public.pilot_withdrawal_status(ARRAY[target],old_other_job) IS NOT NULL THEN
    RAISE EXCEPTION 'Pilot exposed or removed an unrelated completed job';
  END IF;
  IF has_function_privilege('authenticated','public.begin_pilot_withdrawal(uuid,uuid[],jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.claim_pilot_withdrawal(uuid[],uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Pilot management is available to client roles';
  END IF;
END;
$$;
ROLLBACK;
