-- Disposable database only. Use the same delegation shape as hosted Supabase.
BEGIN;
CREATE ROLE withdrawal_storage_operator;
CREATE ROLE withdrawal_storage_control;
GRANT USAGE ON SCHEMA storage, app_private TO withdrawal_storage_operator, withdrawal_storage_control;
SET LOCAL ROLE withdrawal_storage_control;
DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY withdrawal_delegation_probe ON storage.objects FOR SELECT USING (false)';
    RAISE EXCEPTION 'A non-owner could create a Storage policy without delegation';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;
SET LOCAL ROLE withdrawal_storage_operator;
DO $$
BEGIN
  EXECUTE 'CREATE POLICY withdrawal_delegation_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK ((SELECT app_private.can_write_during_withdrawal()))';
  EXECUTE 'CREATE POLICY withdrawal_delegation_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
    USING ((SELECT app_private.can_write_during_withdrawal()))
    WITH CHECK ((SELECT app_private.can_write_during_withdrawal()))';
  EXECUTE 'CREATE POLICY withdrawal_delegation_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
    USING ((SELECT app_private.can_write_during_withdrawal()))';
END;
$$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_policy WHERE polrelid = 'storage.objects'::regclass
    AND polname LIKE 'withdrawal_delegation_%' AND NOT polpermissive) <> 3 THEN
    RAISE EXCEPTION 'Delegation did not create the three restrictive policies';
  END IF;
END;
$$;
ROLLBACK;
