BEGIN;

CREATE TABLE app_private.shopping_group_transfers (
  group_id uuid PRIMARY KEY REFERENCES public.groups(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  CHECK (from_user_id <> to_user_id)
);
ALTER TABLE app_private.shopping_group_transfers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.shopping_group_transfers FROM PUBLIC, anon, authenticated;

CREATE FUNCTION app_private.clear_shopping_group_transfer_on_leave()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM app_private.shopping_group_transfers
  WHERE group_id = OLD.group_id AND OLD.user_id IN (from_user_id, to_user_id);
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION app_private.clear_shopping_group_transfer_on_leave() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER clear_shopping_group_transfer_on_leave AFTER DELETE ON public.group_members
FOR EACH ROW EXECUTE FUNCTION app_private.clear_shopping_group_transfer_on_leave();

CREATE FUNCTION public.shopping_group_transfer_status(p_group_id uuid)
RETURNS TABLE (from_user_id uuid, to_user_id uuid, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT t.from_user_id, t.to_user_id, t.expires_at
  FROM app_private.shopping_group_transfers t
  JOIN public.groups g ON g.id = t.group_id AND g.owner_user_id = t.from_user_id
  JOIN public.group_members m ON m.group_id = t.group_id AND m.user_id = t.to_user_id AND m.role = 'member'
  WHERE t.group_id = p_group_id AND t.expires_at > now()
    AND auth.uid() IN (t.from_user_id, t.to_user_id)
    AND app_private.live_user();
$$;

CREATE FUNCTION public.offer_shopping_group_transfer(p_group_id uuid, p_recipient uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.groups WHERE id = p_group_id FOR UPDATE;
  IF NOT app_private.live_user() OR NOT EXISTS (
    SELECT 1 FROM public.groups WHERE id = p_group_id AND owner_user_id = auth.uid() AND NOT is_personal
  ) OR NOT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = p_recipient AND role = 'member' AND user_id <> auth.uid()
  ) THEN
    RAISE EXCEPTION 'Transfer forbidden' USING ERRCODE = '42501';
  END IF;
  INSERT INTO app_private.shopping_group_transfers(group_id, from_user_id, to_user_id, expires_at)
  VALUES (p_group_id, auth.uid(), p_recipient, now() + interval '24 hours')
  ON CONFLICT (group_id) DO UPDATE SET
    from_user_id = excluded.from_user_id, to_user_id = excluded.to_user_id, expires_at = excluded.expires_at;
END;
$$;

CREATE FUNCTION public.cancel_shopping_group_transfer(p_group_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.groups WHERE id = p_group_id FOR UPDATE;
  IF NOT app_private.owner_of(p_group_id) OR NOT app_private.live_user() THEN
    RAISE EXCEPTION 'Transfer cancellation forbidden' USING ERRCODE = '42501';
  END IF;
  DELETE FROM app_private.shopping_group_transfers WHERE group_id = p_group_id;
END;
$$;

CREATE FUNCTION public.accept_shopping_group_transfer(p_group_id uuid, p_expires_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  offer app_private.shopping_group_transfers%ROWTYPE;
  owned_limit integer;
  member_limit integer;
BEGIN
  -- Serialize ownership-slot consumption with create_shopping_group.
  PERFORM 1 FROM auth.users WHERE id = auth.uid() FOR UPDATE;
  PERFORM 1 FROM public.groups WHERE id = p_group_id FOR UPDATE;
  SELECT * INTO offer FROM app_private.shopping_group_transfers WHERE group_id = p_group_id;
  IF NOT FOUND OR NOT app_private.live_user() OR offer.to_user_id IS DISTINCT FROM auth.uid()
    OR offer.expires_at <= clock_timestamp() OR offer.expires_at IS DISTINCT FROM p_expires_at
    OR NOT EXISTS (
      SELECT 1 FROM public.groups WHERE id = p_group_id AND owner_user_id = offer.from_user_id AND NOT is_personal
    ) OR NOT EXISTS (
      SELECT 1 FROM public.group_members WHERE group_id = p_group_id AND user_id = offer.from_user_id AND role = 'owner'
    ) OR NOT EXISTS (
      SELECT 1 FROM public.group_members WHERE group_id = p_group_id AND user_id = offer.to_user_id AND role = 'member'
    ) THEN
    RAISE EXCEPTION 'Transfer unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT CASE WHEN role = 'admin' THEN 9999 WHEN plan = 'pro' THEN 3 ELSE 1 END,
    CASE WHEN role = 'admin' THEN 9999 WHEN plan = 'pro' THEN 5 ELSE 2 END
  INTO owned_limit, member_limit FROM public.profiles WHERE user_id = offer.to_user_id FOR UPDATE;
  IF (SELECT count(*) FROM public.groups WHERE owner_user_id = offer.to_user_id AND NOT is_personal)
    >= coalesce(owned_limit, 1) THEN
    RAISE EXCEPTION 'TRANSFER_OWNED_GROUP_LIMIT' USING ERRCODE = '23514';
  END IF;
  IF (SELECT count(*) FROM public.group_members WHERE group_id = p_group_id) > coalesce(member_limit, 2) THEN
    RAISE EXCEPTION 'TRANSFER_MEMBER_LIMIT' USING ERRCODE = '23514';
  END IF;
  UPDATE public.groups SET owner_user_id = offer.to_user_id WHERE id = p_group_id;
  UPDATE public.group_members SET role = 'member' WHERE group_id = p_group_id AND user_id = offer.from_user_id;
  UPDATE public.group_members SET role = 'owner' WHERE group_id = p_group_id AND user_id = offer.to_user_id;
  DELETE FROM app_private.shopping_group_transfers WHERE group_id = p_group_id;
END;
$$;

REVOKE ALL ON FUNCTION public.shopping_group_transfer_status(uuid),
  public.offer_shopping_group_transfer(uuid, uuid), public.cancel_shopping_group_transfer(uuid),
  public.accept_shopping_group_transfer(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shopping_group_transfer_status(uuid),
  public.offer_shopping_group_transfer(uuid, uuid), public.cancel_shopping_group_transfer(uuid),
  public.accept_shopping_group_transfer(uuid, timestamptz) TO authenticated;

COMMIT;
