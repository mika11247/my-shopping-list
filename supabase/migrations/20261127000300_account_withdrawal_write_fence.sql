BEGIN;

CREATE FUNCTION app_private.can_write_during_withdrawal() RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- The lock survives the RLS check and serializes the write with the
  -- FOR UPDATE in begin_account_withdrawal. Recheck after waiting.
  PERFORM 1 FROM auth.users WHERE id = auth.uid() FOR KEY SHARE;
  RETURN FOUND AND app_private.live_user();
END;
$$;
REVOKE ALL ON FUNCTION app_private.can_write_during_withdrawal() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_write_during_withdrawal() TO authenticated;

-- Add a restrictive gate to the existing permissions. All existing ownership,
-- scope, and Storage reference predicates still have to pass.
DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'public.shopping_items', 'public.deleted_items', 'public.user_item_master', 'public.profiles',
    'public.groups', 'public.recipes', 'public.recipe_items', 'public.meal_plans',
    'public.meal_plan_entries', 'storage.objects'
  ] LOOP
    EXECUTE format('CREATE POLICY withdrawal_write_insert ON %s AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK ((SELECT app_private.can_write_during_withdrawal()))', target);
    EXECUTE format('CREATE POLICY withdrawal_write_update ON %s AS RESTRICTIVE FOR UPDATE TO authenticated
      USING ((SELECT app_private.can_write_during_withdrawal()))
      WITH CHECK ((SELECT app_private.can_write_during_withdrawal()))', target);
    EXECUTE format('CREATE POLICY withdrawal_write_delete ON %s AS RESTRICTIVE FOR DELETE TO authenticated
      USING ((SELECT app_private.can_write_during_withdrawal()))', target);
  END LOOP;
END;
$$;

COMMIT;
