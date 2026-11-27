-- Synthetic roles only. Exercise the real pg_net objects inside a rollback.
BEGIN;
CREATE ROLE withdrawal_managed_owner;
CREATE ROLE withdrawal_migration_operator;
GRANT USAGE, CREATE ON SCHEMA net TO withdrawal_managed_owner;
GRANT USAGE ON SCHEMA net TO withdrawal_migration_operator, anon, authenticated;
ALTER TABLE net.http_request_queue OWNER TO withdrawal_managed_owner;
ALTER TABLE net._http_response OWNER TO withdrawal_managed_owner;
ALTER FUNCTION net.http_post(text, jsonb, jsonb, jsonb, integer) OWNER TO withdrawal_managed_owner;

SET LOCAL ROLE withdrawal_managed_owner;
GRANT SELECT ON net.http_request_queue, net._http_response TO PUBLIC;
GRANT EXECUTE ON FUNCTION net.http_post(text, jsonb, jsonb, jsonb, integer) TO PUBLIC;
RESET ROLE;

SET LOCAL ROLE withdrawal_migration_operator;
REVOKE ALL ON TABLE net.http_request_queue, net._http_response FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION net.http_post(text, jsonb, jsonb, jsonb, integer) FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF NOT has_table_privilege('anon', 'net.http_request_queue', 'SELECT')
    OR NOT has_table_privilege('authenticated', 'net._http_response', 'SELECT')
    OR has_table_privilege(current_user, 'net.http_request_queue', 'SELECT WITH GRANT OPTION') THEN
    RAISE EXCEPTION 'Hosted non-owner ACL failure was not reproduced';
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE withdrawal_managed_owner;
REVOKE ALL ON TABLE net.http_request_queue, net._http_response FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION net.http_post(text, jsonb, jsonb, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT SELECT ON net.http_request_queue, net._http_response TO withdrawal_migration_operator;
GRANT EXECUTE ON FUNCTION net.http_post(text, jsonb, jsonb, jsonb, integer) TO withdrawal_migration_operator;
RESET ROLE;

DO $$
DECLARE
  app_role name;
  protected_table regclass;
BEGIN
  FOREACH app_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH protected_table IN ARRAY ARRAY[
      'net.http_request_queue'::regclass, 'net._http_response'::regclass,
      'vault.secrets'::regclass, 'vault.decrypted_secrets'::regclass
    ] LOOP
      IF has_table_privilege(app_role, protected_table, 'SELECT')
        OR has_any_column_privilege(app_role, protected_table, 'SELECT') THEN
        RAISE EXCEPTION 'Protected relation % remains readable by %', protected_table, app_role;
      END IF;
    END LOOP;
    IF EXISTS (
      SELECT 1 FROM pg_proc WHERE pronamespace = 'net'::regnamespace
        AND has_function_privilege(app_role, oid, 'EXECUTE')
    ) THEN
      RAISE EXCEPTION 'pg_net function remains executable by %', app_role;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('withdrawal_migration_operator', 'net.http_request_queue', 'SELECT')
    OR NOT has_function_privilege('withdrawal_migration_operator',
      'net.http_post(text,jsonb,jsonb,jsonb,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Worker operator lost its scoped grant';
  END IF;
END;
$$;
ROLLBACK;
