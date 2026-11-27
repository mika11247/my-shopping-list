-- Only run against the disposable withdrawal test database.
BEGIN;
DO $$
DECLARE
  pending_job uuid := gen_random_uuid();
  old_job uuid := gen_random_uuid();
  recent_job uuid := gen_random_uuid();
  expired_lease uuid := gen_random_uuid();
  new_lease uuid := gen_random_uuid();
BEGIN
  INSERT INTO app_private.account_withdrawals(id, stage, lease_id, lease_until)
  VALUES (pending_job, 'storage', expired_lease, clock_timestamp() - interval '1 second');
  INSERT INTO app_private.account_withdrawals(id, stage, completed_at)
  VALUES (old_job, 'complete', now() - interval '31 days'),
         (recent_job, 'complete', now() - interval '29 days');

  IF public.claim_account_withdrawal(pending_job, new_lease)->>'stage' IS DISTINCT FROM 'storage' THEN
    RAISE EXCEPTION 'Expired lease did not resume at the existing checkpoint';
  END IF;
  IF public.advance_account_withdrawal(pending_job, expired_lease, 'release') THEN
    RAISE EXCEPTION 'Expired worker advanced the resumed job';
  END IF;
  IF NOT public.advance_account_withdrawal(pending_job, new_lease, 'release') THEN
    RAISE EXCEPTION 'Active worker could not release its lease';
  END IF;
  IF public.account_withdrawal_status(old_job) IS NOT NULL
    OR public.account_withdrawal_status(recent_job) IS DISTINCT FROM 'complete' THEN
    RAISE EXCEPTION 'Completed records did not follow the 30-day retention rule';
  END IF;
END;
$$;
ROLLBACK;
