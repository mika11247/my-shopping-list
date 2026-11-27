BEGIN;

CREATE TABLE app_private.withdrawal_pilot_jobs (
  job_id uuid PRIMARY KEY REFERENCES app_private.account_withdrawals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL
);
ALTER TABLE app_private.withdrawal_pilot_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.withdrawal_pilot_jobs FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.begin_pilot_withdrawal(p_user uuid, p_users uuid[], p_confirmed jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  job uuid;
  verified_email text;
BEGIN
  IF (p_user = ANY(p_users)) IS NOT TRUE THEN
    RAISE EXCEPTION 'Pilot account not permitted' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('lock_timeout', '5s', true);
  -- Same lock order as the regular DB phase, so the scope cannot change before deletion.
  LOCK TABLE public.groups, public.group_members, public.invitations, public.shopping_items,
    public.deleted_items, public.recipes, public.recipe_items, public.meal_plans,
    public.meal_plan_entries, public.user_item_master IN SHARE ROW EXCLUSIVE MODE;
  SELECT email INTO verified_email FROM auth.users
    WHERE id = p_user AND email_confirmed_at IS NOT NULL FOR UPDATE;
  IF verified_email IS NULL OR EXISTS (
    SELECT 1 FROM auth.users WHERE id <> p_user AND lower(email) = lower(verified_email)
  ) OR EXISTS (SELECT 1 FROM public.groups WHERE owner_user_id = p_user)
    OR EXISTS (SELECT 1 FROM public.group_members WHERE user_id = p_user)
    OR EXISTS (SELECT 1 FROM public.shopping_items WHERE user_id = p_user AND group_id IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public.deleted_items WHERE user_id = p_user AND group_id IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public.meal_plans WHERE user_id = p_user AND group_id IS NOT NULL)
    OR EXISTS (
      SELECT 1 FROM public.invitations i
      WHERE (i.invited_by = p_user OR lower(i.email) = lower(verified_email))
        AND (lower(i.email) IS DISTINCT FROM lower(verified_email)
          OR EXISTS (SELECT 1 FROM public.groups g WHERE g.id = i.group_id))
    )
    OR EXISTS (
      SELECT 1 FROM public.meal_plan_entries e JOIN public.recipes r ON r.id = e.recipe_id
      JOIN public.meal_plans m ON m.id = e.meal_plan_id
      WHERE r.user_id = p_user AND (m.user_id <> p_user OR m.group_id IS NOT NULL)
    )
    OR EXISTS (
      SELECT 1 FROM public.recipe_items i JOIN public.user_item_master m ON m.id = i.user_item_master_id
      JOIN public.recipes r ON r.id = i.recipe_id WHERE m.user_id = p_user AND r.user_id <> p_user
    )
    OR EXISTS (
      SELECT 1 FROM storage.objects o WHERE o.owner_id = p_user::text OR o.owner = p_user
        OR split_part(o.name, '/', 1) = p_user::text
    ) THEN
    RAISE EXCEPTION 'Pilot data isolation check failed' USING ERRCODE = '23514';
  END IF;
  SELECT w.id INTO job FROM app_private.account_withdrawals w WHERE w.user_id = p_user;
  IF FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM app_private.withdrawal_pilot_jobs WHERE job_id = job AND user_id = p_user) THEN
      RAISE EXCEPTION 'Existing non-pilot withdrawal' USING ERRCODE = '23514';
    END IF;
    RETURN job;
  END IF;
  job := public.begin_account_withdrawal(p_user, p_confirmed);
  INSERT INTO app_private.withdrawal_pilot_jobs(job_id,user_id) VALUES (job,p_user);
  RETURN job;
END;
$$;

CREATE FUNCTION public.claim_pilot_withdrawal(p_users uuid[], p_lease uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  job app_private.account_withdrawals%ROWTYPE;
BEGIN
  DELETE FROM app_private.account_withdrawals w USING app_private.withdrawal_pilot_jobs p
  WHERE w.id = p.job_id AND p.user_id = ANY(p_users) AND w.completed_at < now() - interval '30 days';
  SELECT w.* INTO job FROM app_private.account_withdrawals w
  JOIN app_private.withdrawal_pilot_jobs p ON p.job_id = w.id
  WHERE p.user_id = ANY(p_users) AND (w.user_id IS NULL OR w.user_id = p.user_id)
    AND (w.lease_until IS NULL OR w.lease_until < clock_timestamp())
    AND (w.stage <> 'complete' OR w.email IS NOT NULL)
  ORDER BY w.completed_at NULLS FIRST, w.id LIMIT 1 FOR UPDATE OF w SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE app_private.account_withdrawals SET lease_id = p_lease,
    lease_until = clock_timestamp() + interval '5 minutes' WHERE id = job.id;
  RETURN jsonb_build_object('id',job.id,'userId',job.user_id,'email',job.email,'stage',job.stage);
END;
$$;

CREATE FUNCTION public.pilot_withdrawal_status(p_users uuid[], p_job uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN w.stage = 'complete' THEN 'complete' ELSE 'pending' END
  FROM app_private.account_withdrawals w JOIN app_private.withdrawal_pilot_jobs p ON p.job_id = w.id
  WHERE w.id = p_job AND p.user_id = ANY(p_users);
$$;

REVOKE ALL ON FUNCTION public.begin_pilot_withdrawal(uuid,uuid[],jsonb),
  public.claim_pilot_withdrawal(uuid[],uuid), public.pilot_withdrawal_status(uuid[],uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_pilot_withdrawal(uuid,uuid[],jsonb),
  public.claim_pilot_withdrawal(uuid[],uuid), public.pilot_withdrawal_status(uuid[],uuid)
  TO service_role;
COMMIT;
