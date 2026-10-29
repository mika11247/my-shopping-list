-- Additive quota enforcement. Apply only after the October authorization migration.
-- Never disables RLS or changes Storage/Auth policies. Existing over-limit rows remain.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '60s';
-- Keep initialization and trigger installation atomic with respect to all writes.
LOCK TABLE public.user_item_master IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE app_private.my_item_usage (
  user_id uuid PRIMARY KEY,
  item_count bigint NOT NULL CHECK (item_count >= 0)
);
ALTER TABLE app_private.my_item_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.my_item_usage FROM PUBLIC, anon, authenticated;
-- Derived from My Items, not Auth: retain counters for existing orphan owners.
-- If the SAME Auth UUID is restored, the retained rows already consume slots.
-- Auth deletion cannot remove a counter while its My Items still exist.
-- No Auth trigger/FK or existing data/policy is changed.
INSERT INTO app_private.my_item_usage(user_id,item_count)
SELECT user_id,count(*) FROM public.user_item_master GROUP BY user_id;

CREATE FUNCTION app_private.my_item_limit(p_role text,p_plan text) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN p_role='admin' THEN 9999 WHEN p_plan='pro' THEN 200
 WHEN p_plan='special' THEN 50 ELSE 30 END;
$$;
REVOKE ALL ON FUNCTION app_private.my_item_limit(text,text) FROM PUBLIC,anon,authenticated;

-- SECURITY DEFINER is limited to internal counter/profile access. The table's
-- existing RLS still authorizes each user_item_master row before AFTER INSERT.
-- Atomic UPDATE creates a write conflict under every isolation level: a stale
-- REPEATABLE READ/SERIALIZABLE writer fails rather than overshooting capacity.
CREATE FUNCTION app_private.enforce_my_item_quota() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE capacity integer;
BEGIN
 IF TG_OP='DELETE' THEN
   UPDATE app_private.my_item_usage SET item_count=item_count-1
   WHERE user_id=OLD.user_id AND item_count>0;
   -- Remove only empty derived metadata, never original data or images.
   DELETE FROM app_private.my_item_usage WHERE user_id=OLD.user_id AND item_count=0;
   RETURN OLD;
 END IF;
 IF NOT app_private.live_user() OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
   RAISE EXCEPTION 'My Items ownership required' USING ERRCODE='42501';
 END IF;
 SELECT app_private.my_item_limit(role,plan) INTO capacity
 FROM public.profiles WHERE user_id=NEW.user_id;
 capacity := coalesce(capacity,30);
 INSERT INTO app_private.my_item_usage(user_id,item_count) VALUES(NEW.user_id,0)
 ON CONFLICT(user_id) DO NOTHING;
 UPDATE app_private.my_item_usage SET item_count=item_count+1
 WHERE user_id=NEW.user_id AND item_count<capacity;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'MY_ITEMS_LIMIT: maximum % items',capacity USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.enforce_my_item_quota() FROM PUBLIC,anon,authenticated;

-- AFTER INSERT only counts rows actually created: ON CONFLICT DO NOTHING or
-- DO UPDATE must not consume a slot. Batch failure rolls back rows AND counts.
CREATE TRIGGER my_item_quota_insert AFTER INSERT ON public.user_item_master
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_my_item_quota();
CREATE TRIGGER my_item_quota_delete AFTER DELETE ON public.user_item_master
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_my_item_quota();

CREATE FUNCTION app_private.keep_my_item_owner() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
   RAISE EXCEPTION 'My Items owner cannot be changed' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.keep_my_item_owner() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER my_item_owner_update BEFORE UPDATE ON public.user_item_master
FOR EACH ROW EXECUTE FUNCTION app_private.keep_my_item_owner();
COMMIT;
