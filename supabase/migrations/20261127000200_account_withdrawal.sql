BEGIN;

CREATE TABLE app_private.account_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  email text,
  stage text NOT NULL CHECK (stage IN ('storage', 'auth', 'complete')),
  completed_at timestamptz,
  notified_at timestamptz,
  lease_id uuid,
  lease_until timestamptz
);
ALTER TABLE app_private.account_withdrawals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.account_withdrawals FROM PUBLIC, anon, authenticated;

CREATE TABLE app_private.withdrawal_retained_image_candidates (
  job_id uuid NOT NULL REFERENCES app_private.account_withdrawals(id) ON DELETE CASCADE,
  object_id uuid NOT NULL,
  PRIMARY KEY (job_id, object_id)
);
ALTER TABLE app_private.withdrawal_retained_image_candidates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.withdrawal_retained_image_candidates FROM PUBLIC, anon, authenticated;

CREATE TABLE app_private.withdrawal_email_checks (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  proof text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempts integer NOT NULL DEFAULT 0
);
ALTER TABLE app_private.withdrawal_email_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.withdrawal_email_checks FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.issue_withdrawal_email_check(p_user uuid, p_session uuid, p_proof text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user AND email_confirmed_at IS NOT NULL)
    OR NOT EXISTS (SELECT 1 FROM auth.sessions WHERE id = p_session AND user_id = p_user) THEN
    RETURN false;
  END IF;
  INSERT INTO app_private.withdrawal_email_checks(user_id, session_id, proof)
    VALUES (p_user, p_session, p_proof)
  ON CONFLICT (user_id) DO UPDATE SET session_id = excluded.session_id, proof = excluded.proof,
    sent_at = excluded.sent_at, attempts = 0
  WHERE app_private.withdrawal_email_checks.sent_at < clock_timestamp() - interval '1 minute';
  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.consume_withdrawal_email_check(p_user uuid, p_session uuid, p_proof text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE matches boolean;
BEGIN
  UPDATE app_private.withdrawal_email_checks SET attempts = attempts + 1
  WHERE user_id = p_user AND session_id = p_session AND attempts < 5
    AND sent_at > clock_timestamp() - interval '10 minutes'
    AND EXISTS (SELECT 1 FROM auth.sessions WHERE id = p_session AND user_id = p_user)
  RETURNING proof = p_proof INTO matches;
  IF matches THEN
    UPDATE app_private.withdrawal_email_checks SET attempts = 5, proof = '' WHERE user_id = p_user;
  END IF;
  RETURN coalesce(matches, false);
END;
$$;

REVOKE ALL ON FUNCTION public.issue_withdrawal_email_check(uuid, uuid, text),
  public.consume_withdrawal_email_check(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_withdrawal_email_check(uuid, uuid, text),
  public.consume_withdrawal_email_check(uuid, uuid, text) TO service_role;

-- A restored UUID must not reactivate JWTs from deleted Auth sessions.
CREATE FUNCTION public.withdrawal_session_is_active(p_user uuid, p_session uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.sessions
    WHERE id = p_session AND user_id = p_user AND (not_after IS NULL OR not_after > now())
  );
$$;
REVOKE ALL ON FUNCTION public.withdrawal_session_is_active(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.withdrawal_session_is_active(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION app_private.live_user() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid())
    AND public.withdrawal_session_is_active(auth.uid(), CASE
      WHEN (auth.jwt()->>'session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (auth.jwt()->>'session_id')::uuid END)
    AND NOT EXISTS (SELECT 1 FROM app_private.account_withdrawals WHERE user_id = auth.uid());
$$;
CREATE OR REPLACE FUNCTION app_private.member_of(g uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app_private.live_user()
    AND (EXISTS (SELECT 1 FROM public.groups WHERE id = g AND owner_user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.group_members WHERE group_id = g AND user_id = auth.uid()));
$$;
CREATE OR REPLACE FUNCTION app_private.owner_of(g uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app_private.live_user()
    AND EXISTS (SELECT 1 FROM public.groups WHERE id = g AND owner_user_id = auth.uid());
$$;

ALTER TABLE public.shopping_items ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.deleted_items ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.shopping_items ADD CONSTRAINT shopping_items_attribution_check
  CHECK (user_id IS NOT NULL OR group_id IS NOT NULL);
ALTER TABLE public.deleted_items ADD CONSTRAINT deleted_items_attribution_check
  CHECK (user_id IS NOT NULL OR group_id IS NOT NULL);

-- The dedicated SECURITY DEFINER function runs as this security migration's
-- owner. Ordinary service-role and authenticated UPDATEs still use the guard.
CREATE OR REPLACE FUNCTION app_private.keep_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR
    (TG_TABLE_NAME <> 'meal_plans' AND NEW.group_id IS DISTINCT FROM OLD.group_id) THEN
    IF current_user = pg_catalog.pg_get_userbyid((
      SELECT proowner FROM pg_catalog.pg_proc
      WHERE oid = pg_catalog.to_regprocedure('public.begin_account_withdrawal(uuid,jsonb)')
    )) AND OLD.group_id IS NOT NULL AND NEW.group_id = OLD.group_id
      AND EXISTS (SELECT 1 FROM app_private.account_withdrawals WHERE user_id = OLD.user_id)
      AND (
        (TG_TABLE_NAME IN ('shopping_items', 'deleted_items') AND NEW.user_id IS NULL)
        OR (TG_TABLE_NAME = 'meal_plans' AND NEW.user_id = (
          SELECT owner_user_id FROM public.groups WHERE id = OLD.group_id
        ))
      ) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Ownership and group cannot be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.account_withdrawal_preview(p_user uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'name', g.name,
    'owner', g.owner_user_id = p_user,
    'otherMembers', (SELECT count(*) FROM public.group_members WHERE group_id = g.id AND user_id <> p_user),
    'shopping', (SELECT count(*) FROM public.shopping_items WHERE group_id = g.id),
    'history', (SELECT count(*) FROM public.deleted_items WHERE group_id = g.id),
    'mealPlans', (SELECT count(*) FROM public.meal_plans WHERE group_id = g.id)
  ) ORDER BY g.id), '[]'::jsonb)
  FROM public.groups g
  WHERE g.owner_user_id = p_user OR EXISTS (
    SELECT 1 FROM public.group_members WHERE group_id = g.id AND user_id = p_user
  );
$$;

CREATE FUNCTION public.begin_account_withdrawal(p_user uuid, p_confirmed jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  job uuid;
  closed_groups uuid[];
  verified_email text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  -- Acquire table locks before row locks to serialize with direct Data API writes.
  LOCK TABLE public.groups, public.group_members, public.invitations, public.shopping_items,
    public.deleted_items, public.recipes, public.recipe_items, public.meal_plans,
    public.meal_plan_entries, public.user_item_master IN SHARE ROW EXCLUSIVE MODE;
  SELECT email INTO verified_email FROM auth.users
    WHERE id = p_user AND email_confirmed_at IS NOT NULL FOR UPDATE;
  SELECT id INTO job FROM app_private.account_withdrawals WHERE user_id = p_user;
  IF FOUND THEN RETURN job; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user) THEN
    RAISE EXCEPTION 'Withdrawal unavailable' USING ERRCODE = '42501';
  END IF;
  IF public.account_withdrawal_preview(p_user) IS DISTINCT FROM p_confirmed THEN
    RAISE EXCEPTION 'WITHDRAWAL_RECONFIRM' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.groups g JOIN public.group_members m ON m.group_id = g.id
    WHERE g.owner_user_id = p_user AND m.user_id <> p_user
  ) THEN
    RAISE EXCEPTION 'WITHDRAWAL_TRANSFER_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.meal_plans p JOIN public.groups g ON g.id = p.group_id
    JOIN app_private.account_withdrawals w ON w.user_id = g.owner_user_id
    WHERE p.user_id = p_user
  ) THEN
    RAISE EXCEPTION 'WITHDRAWAL_SHARED_OWNER_UNAVAILABLE' USING ERRCODE = '23514';
  END IF;

  INSERT INTO app_private.account_withdrawals(user_id, email, stage)
  VALUES (p_user, verified_email, 'storage') RETURNING id INTO job;
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO closed_groups FROM public.groups WHERE owner_user_id = p_user;
  INSERT INTO app_private.withdrawal_retained_image_candidates(job_id, object_id)
  SELECT job, o.id FROM storage.objects o
  WHERE o.owner_id IS NULL AND o.owner IS NULL AND o.name ~ '^retained/[0-9a-f-]{36}$'
    AND o.bucket_id IN ('item-images', 'recipe-images')
    AND (
      EXISTS (SELECT 1 FROM public.shopping_items s
        WHERE (s.group_id = ANY(closed_groups) OR (s.group_id IS NULL AND s.user_id = p_user))
          AND substring(split_part(split_part(s.image_url, '#', 1), '?', 1)
            FROM '^https?://[^/@?#[:space:]]+/storage/v1/object/public/(.*)$') = o.bucket_id || '/' || o.name)
      OR EXISTS (SELECT 1 FROM public.user_item_master m
        WHERE m.user_id = p_user AND substring(split_part(split_part(m.image_url, '#', 1), '?', 1)
          FROM '^https?://[^/@?#[:space:]]+/storage/v1/object/public/(.*)$') = o.bucket_id || '/' || o.name)
      OR EXISTS (SELECT 1 FROM public.recipes r
        WHERE r.user_id = p_user AND (substring(split_part(split_part(r.image_url, '#', 1), '?', 1)
          FROM '^https?://[^/@?#[:space:]]+/storage/v1/object/public/(.*)$') = o.bucket_id || '/' || o.name
          OR (o.bucket_id = 'recipe-images' AND r.image_path = o.name)))
    );
  DELETE FROM public.shopping_items WHERE group_id = ANY(closed_groups) OR (group_id IS NULL AND user_id = p_user);
  DELETE FROM public.deleted_items WHERE group_id = ANY(closed_groups) OR (group_id IS NULL AND user_id = p_user);
  DELETE FROM public.meal_plans WHERE group_id = ANY(closed_groups) OR (group_id IS NULL AND user_id = p_user);
  DELETE FROM public.invitations WHERE group_id = ANY(closed_groups) OR invited_by = p_user
    OR lower(email) = lower(verified_email);
  DELETE FROM public.groups WHERE id = ANY(closed_groups);

  UPDATE public.shopping_items SET user_id = NULL WHERE user_id = p_user AND group_id IS NOT NULL;
  UPDATE public.deleted_items SET user_id = NULL, purchased_by_name = '退会済みユーザー'
    WHERE user_id = p_user AND group_id IS NOT NULL;
  UPDATE public.meal_plans p SET user_id = g.owner_user_id
    FROM public.groups g WHERE p.group_id = g.id AND p.user_id = p_user;
  DELETE FROM public.recipes WHERE user_id = p_user;
  DELETE FROM public.user_item_master WHERE user_id = p_user;
  DELETE FROM public.group_members WHERE user_id = p_user;
  RETURN job;
END;
$$;

REVOKE ALL ON FUNCTION public.account_withdrawal_preview(uuid),
  public.begin_account_withdrawal(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_withdrawal_preview(uuid),
  public.begin_account_withdrawal(uuid, jsonb) TO service_role;

CREATE TABLE app_private.withdrawal_retired_images (
  bucket text NOT NULL,
  path text NOT NULL,
  job_id uuid NOT NULL REFERENCES app_private.account_withdrawals(id) ON DELETE CASCADE,
  PRIMARY KEY (bucket, path)
);
ALTER TABLE app_private.withdrawal_retired_images ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.withdrawal_retired_images FROM PUBLIC, anon, authenticated;

CREATE FUNCTION app_private.prevent_retired_image_reference() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM app_private.withdrawal_retired_images r
    WHERE app_private.image_url_references(NEW.image_url, r.bucket, r.path)
      OR (TG_TABLE_NAME = 'recipes' AND r.bucket = 'recipe-images'
        AND (to_jsonb(NEW)->>'image_path' = r.path
          OR to_jsonb(NEW)->>'image_path' ~ '[%?#[:space:]]'))
  ) THEN
    RAISE EXCEPTION 'Image is being retired' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.prevent_retired_image_reference() FROM PUBLIC, anon, authenticated;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['shopping_items', 'user_item_master', 'item_master', 'recipes'] LOOP
    EXECUTE format('CREATE TRIGGER prevent_retired_image_reference BEFORE INSERT OR UPDATE OF %s ON public.%I
      FOR EACH ROW EXECUTE FUNCTION app_private.prevent_retired_image_reference()',
      CASE WHEN t = 'recipes' THEN 'image_url, image_path' ELSE 'image_url' END, t);
  END LOOP;
END;
$$;

CREATE FUNCTION public.claim_account_withdrawal(p_job uuid, p_lease uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE job app_private.account_withdrawals%ROWTYPE;
BEGIN
  -- Completed records contain no account identifier or email after delivery.
  DELETE FROM app_private.account_withdrawals WHERE completed_at < now() - interval '30 days';
  SELECT * INTO job FROM app_private.account_withdrawals
  WHERE (p_job IS NULL OR id = p_job) AND (lease_until IS NULL OR lease_until < clock_timestamp())
    AND (stage <> 'complete' OR email IS NOT NULL)
  ORDER BY completed_at NULLS FIRST, id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE app_private.account_withdrawals SET lease_id = p_lease,
    lease_until = clock_timestamp() + interval '5 minutes' WHERE id = job.id;
  RETURN jsonb_build_object('id', job.id, 'userId', job.user_id, 'email', job.email, 'stage', job.stage);
END;
$$;

CREATE FUNCTION public.account_withdrawal_status(p_job uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN stage = 'complete' THEN 'complete' ELSE 'pending' END
  FROM app_private.account_withdrawals WHERE id = p_job;
$$;

CREATE FUNCTION public.account_withdrawal_images(p_job uuid, p_lease uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id, 'bucket', o.bucket_id, 'path', o.name,
    'owned', (o.owner_id = w.user_id::text OR o.owner::text = w.user_id::text) IS TRUE OR c.object_id IS NOT NULL,
    'referenced', app_private.image_referenced(o.bucket_id, o.name)
  ) ORDER BY o.id), '[]'::jsonb)
  FROM app_private.account_withdrawals w CROSS JOIN storage.objects o
    LEFT JOIN app_private.withdrawal_retained_image_candidates c ON c.job_id = w.id AND c.object_id = o.id
  WHERE w.id = p_job AND w.stage = 'storage' AND w.lease_id = p_lease AND w.lease_until > clock_timestamp()
    AND (o.owner_id = w.user_id::text OR o.owner::text = w.user_id::text OR split_part(o.name, '/', 1) = w.user_id::text
      OR (c.object_id IS NOT NULL AND o.owner_id IS NULL AND o.owner IS NULL
        AND NOT app_private.image_referenced(o.bucket_id, o.name)));
$$;

CREATE FUNCTION public.retire_account_image(
  p_job uuid, p_lease uuid, p_bucket text, p_path text, p_old_url text, p_new_url text, p_new_path text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE owner_uuid uuid;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  LOCK TABLE public.shopping_items, public.user_item_master, public.item_master, public.recipes
    IN SHARE ROW EXCLUSIVE MODE;
  SELECT user_id INTO owner_uuid FROM app_private.account_withdrawals
  WHERE id = p_job AND stage = 'storage' AND lease_id = p_lease AND lease_until > clock_timestamp() FOR UPDATE;
  IF owner_uuid IS NULL OR p_bucket NOT IN ('item-images', 'recipe-images') OR NOT EXISTS (
    SELECT 1 FROM storage.objects o WHERE o.bucket_id = p_bucket AND o.name = p_path
    AND (o.owner_id = owner_uuid::text OR o.owner::text = owner_uuid::text OR
      (p_new_url IS NULL AND o.owner_id IS NULL AND o.owner IS NULL AND EXISTS (
        SELECT 1 FROM app_private.withdrawal_retained_image_candidates c
        WHERE c.job_id = p_job AND c.object_id = o.id
      )))
  ) THEN RAISE EXCEPTION 'Image retirement unavailable' USING ERRCODE = '42501'; END IF;
  IF p_new_url IS NOT NULL THEN
    UPDATE public.shopping_items SET image_url = p_new_url
      WHERE split_part(split_part(image_url, '#', 1), '?', 1) = p_old_url;
    UPDATE public.user_item_master SET image_url = p_new_url
      WHERE split_part(split_part(image_url, '#', 1), '?', 1) = p_old_url;
    UPDATE public.item_master SET image_url = p_new_url
      WHERE split_part(split_part(image_url, '#', 1), '?', 1) = p_old_url;
    UPDATE public.recipes SET
      image_url = CASE WHEN split_part(split_part(image_url, '#', 1), '?', 1) = p_old_url THEN p_new_url ELSE image_url END,
      image_path = CASE WHEN p_bucket = 'recipe-images' AND image_path = p_path THEN p_new_path ELSE image_path END
      WHERE split_part(split_part(image_url, '#', 1), '?', 1) = p_old_url
        OR (p_bucket = 'recipe-images' AND image_path = p_path);
  END IF;
  IF app_private.image_referenced(p_bucket, p_path) THEN
    RAISE EXCEPTION 'Unresolved image reference' USING ERRCODE = '23514';
  END IF;
  INSERT INTO app_private.withdrawal_retired_images(bucket, path, job_id)
    VALUES (p_bucket, p_path, p_job) ON CONFLICT DO NOTHING;
END;
$$;

CREATE FUNCTION public.advance_account_withdrawal(p_job uuid, p_lease uuid, p_action text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE job app_private.account_withdrawals%ROWTYPE;
BEGIN
  SELECT * INTO job FROM app_private.account_withdrawals
    WHERE id = p_job AND lease_id = p_lease AND lease_until > clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_action = 'storage_done' AND job.stage = 'storage' AND NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE owner_id = job.user_id::text OR owner::text = job.user_id::text
      OR split_part(name, '/', 1) = job.user_id::text
  ) AND NOT EXISTS (
    SELECT 1 FROM app_private.withdrawal_retained_image_candidates c
    JOIN storage.objects o ON o.id = c.object_id
    WHERE c.job_id = p_job AND o.owner_id IS NULL AND o.owner IS NULL
      AND NOT app_private.image_referenced(o.bucket_id, o.name)
  ) THEN
    UPDATE app_private.account_withdrawals SET stage = 'auth' WHERE id = p_job;
    DELETE FROM app_private.withdrawal_retired_images WHERE job_id = p_job;
    DELETE FROM app_private.withdrawal_retained_image_candidates WHERE job_id = p_job;
  ELSIF p_action = 'auth_done' AND job.stage = 'auth' AND NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = job.user_id
  ) THEN
    UPDATE app_private.account_withdrawals SET stage = 'complete', user_id = NULL, completed_at = clock_timestamp()
    WHERE id = p_job;
  ELSIF p_action = 'notify_done' AND job.stage = 'complete' THEN
    UPDATE app_private.account_withdrawals SET email = NULL, notified_at = clock_timestamp() WHERE id = p_job;
  ELSIF p_action <> 'release' THEN
    RETURN false;
  END IF;
  UPDATE app_private.account_withdrawals SET lease_id = NULL, lease_until = NULL WHERE id = p_job;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_account_withdrawal(uuid, uuid), public.account_withdrawal_status(uuid),
  public.account_withdrawal_images(uuid, uuid), public.retire_account_image(uuid, uuid, text, text, text, text, text),
  public.advance_account_withdrawal(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_account_withdrawal(uuid, uuid), public.account_withdrawal_status(uuid),
  public.account_withdrawal_images(uuid, uuid), public.retire_account_image(uuid, uuid, text, text, text, text, text),
  public.advance_account_withdrawal(uuid, uuid, text) TO service_role;

COMMIT;
