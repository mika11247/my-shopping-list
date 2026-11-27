BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- pg_net stores request headers in plaintext until dispatch. Restrict both
-- this queue and the Vault objects, even if their schemas are exposed later.
REVOKE ALL ON TABLE net.http_request_queue, net._http_response,
  vault.secrets, vault.decrypted_secrets FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA net FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  app_role name;
  protected_relation regclass;
BEGIN
  FOREACH app_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH protected_relation IN ARRAY ARRAY[
      'net.http_request_queue'::regclass, 'net._http_response'::regclass,
      'vault.secrets'::regclass, 'vault.decrypted_secrets'::regclass
    ] LOOP
      IF has_table_privilege(app_role, protected_relation, 'SELECT')
        OR has_any_column_privilege(app_role, protected_relation, 'SELECT') THEN
        RAISE EXCEPTION 'Withdrawal scheduler ACL blocks release: role % can read %',
          app_role, protected_relation
          USING HINT = 'Have the managed object owner revoke the app role or PUBLIC grant; retry without weakening this check.';
      END IF;
    END LOOP;
    IF EXISTS (
      SELECT 1 FROM pg_proc WHERE pronamespace = 'net'::regnamespace
        AND has_function_privilege(app_role, oid, 'EXECUTE')
    ) THEN
      RAISE EXCEPTION 'Withdrawal scheduler ACL blocks release: role % can execute pg_net functions', app_role
        USING HINT = 'Have the managed object owner revoke the app role or PUBLIC grant.';
    END IF;
  END LOOP;
END;
$$;

-- Invoker rights keep scheduling, the fixed endpoint and secret lookup under
-- operator control. This migration installs no active schedule or secret.
CREATE FUNCTION app_private.dispatch_account_withdrawal(p_worker_url text) RETURNS bigint
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  worker_secret text;
BEGIN
  IF p_worker_url IS NULL OR (
    p_worker_url !~ '^https://[[:alnum:]][[:alnum:].-]*(:[0-9]{1,5})?/api/delete-user$'
    AND NOT (
      coalesce(current_setting('app.withdrawal_cron_allow_isolated_http', true), '') = 'on'
      AND p_worker_url ~ '^http://[[:alnum:]][[:alnum:].-]*(:[0-9]{1,5})?/api/delete-user$'
    )
  ) THEN
    RAISE EXCEPTION 'Invalid withdrawal worker endpoint';
  END IF;

  IF NOT pg_try_advisory_xact_lock(20261127, 4) THEN
    RETURN NULL;
  END IF;

  DELETE FROM app_private.account_withdrawals
  WHERE stage = 'complete' AND completed_at < now() - interval '30 days';

  IF NOT EXISTS (
    SELECT 1 FROM app_private.account_withdrawals
    WHERE (stage <> 'complete' OR email IS NOT NULL)
      AND (lease_until IS NULL OR lease_until < clock_timestamp())
  ) THEN
    RETURN NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM net.http_request_queue WHERE url = p_worker_url AND method = 'POST') THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO worker_secret
  FROM vault.decrypted_secrets WHERE name = 'account_withdrawal_worker_secret';
  IF worker_secret IS NULL OR octet_length(worker_secret) < 32 THEN
    RAISE EXCEPTION 'Withdrawal worker secret is missing or too short';
  END IF;

  RETURN net.http_post(
    url := p_worker_url,
    body := '{"action":"worker"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-withdrawal-worker', worker_secret),
    timeout_milliseconds := 60000
  );
END;
$$;

CREATE FUNCTION app_private.prune_account_withdrawal_cron_history() RETURNS void
LANGUAGE sql SET search_path = '' AS $$
  DELETE FROM cron.job_run_details r
  USING cron.job j
  WHERE r.jobid = j.jobid AND j.username = current_user
    AND j.jobname IN ('account-withdrawal-dispatch', 'account-withdrawal-history-cleanup')
    AND r.end_time < now() - interval '7 days';
$$;

REVOKE ALL ON FUNCTION app_private.dispatch_account_withdrawal(text),
  app_private.prune_account_withdrawal_cron_history() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
