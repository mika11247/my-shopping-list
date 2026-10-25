-- REVIEW CANDIDATE. Never run automatically against a remote database.
-- Execute as application-schema owner in an isolated environment first.
-- Hosted postgres manages Storage policies via supautils.policy_grants.
-- Require preflight evidence that Storage RLS and API grants already exist.
-- Do not change platform ownership or disable Storage safeguards to force it.
BEGIN;
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA app_private TO authenticated;

CREATE OR REPLACE FUNCTION app_private.member_of(g uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users WHERE id=auth.uid())
 AND (EXISTS (SELECT 1 FROM public.groups WHERE id=g AND owner_user_id=auth.uid())
 OR EXISTS (SELECT 1 FROM public.group_members WHERE group_id=g AND user_id=auth.uid()));
$$;
CREATE OR REPLACE FUNCTION app_private.owner_of(g uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users WHERE id=auth.uid())
 AND EXISTS (SELECT 1 FROM public.groups WHERE id=g AND owner_user_id=auth.uid());
$$;
CREATE OR REPLACE FUNCTION app_private.live_user() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users WHERE id=auth.uid());
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app_private TO authenticated;

-- Remove the permissive alternatives, not just add stricter OR branches.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT schemaname,tablename,policyname FROM pg_policies
 WHERE (schemaname='public' AND tablename IN
 ('shopping_items','deleted_items','user_item_master','item_master','profiles',
 'groups','group_members','invitations','recipes','recipe_items','meal_plans','meal_plan_entries'))
 OR (schemaname='storage' AND tablename='objects')
 LOOP EXECUTE format('DROP POLICY %I ON %I.%I',r.policyname,r.schemaname,r.tablename); END LOOP;
END $$;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['shopping_items','deleted_items','user_item_master','item_master','profiles',
 'groups','group_members','invitations','recipes','recipe_items','meal_plans','meal_plan_entries'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 END LOOP;
END $$;
GRANT INSERT,UPDATE,DELETE ON public.shopping_items,public.deleted_items,
 public.user_item_master,public.recipes,public.recipe_items,public.meal_plans,public.meal_plan_entries TO authenticated;
GRANT UPDATE(name) ON public.groups TO authenticated;
GRANT UPDATE(display_name) ON public.profiles TO authenticated;
-- Table-level REVOKE does not remove pre-existing column-level grants.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'
 AND table_name IN ('shopping_items','deleted_items','user_item_master','item_master','profiles','groups','group_members','invitations','recipes','recipe_items','meal_plans','meal_plan_entries') LOOP
 EXECUTE format('REVOKE ALL (%I) ON public.%I FROM PUBLIC,anon,authenticated',r.column_name,r.table_name);
 END LOOP;
END $$;
GRANT UPDATE(name) ON public.groups TO authenticated;
GRANT UPDATE(display_name) ON public.profiles TO authenticated;
-- Sequence access is limited to the identity tables used by these features.
DO $$ DECLARE t text; s text; BEGIN
 FOREACH t IN ARRAY ARRAY['shopping_items','deleted_items','user_item_master','recipe_items','meal_plan_entries'] LOOP
 s := pg_get_serial_sequence('public.'||t,'id');
 IF s IS NOT NULL THEN
 EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC,anon,authenticated',s);
 EXECUTE format('GRANT USAGE ON SEQUENCE %s TO authenticated',s);
 END IF;
 END LOOP;
END $$;

-- Freeze scope/creator identifiers after insertion even for shared editors.
CREATE OR REPLACE FUNCTION app_private.keep_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 -- Meal-plan creators may change scope; its UPDATE RLS checks both the old
 -- scope and the new scope. Shopping/history creators and scopes stay fixed.
 IF NEW.user_id IS DISTINCT FROM OLD.user_id OR
 (TG_TABLE_NAME <> 'meal_plans' AND NEW.group_id IS DISTINCT FROM OLD.group_id) THEN
 RAISE EXCEPTION 'Ownership and group cannot be changed' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['shopping_items','deleted_items','meal_plans'] LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS security_keep_scope ON public.%I',t);
 EXECUTE format('CREATE TRIGGER security_keep_scope BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION app_private.keep_scope()',t);
 END LOOP;
END $$;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['shopping_items','deleted_items'] LOOP
 EXECUTE format('CREATE POLICY secure_read ON public.%I FOR SELECT TO authenticated USING (app_private.live_user() AND ((group_id IS NULL AND user_id=auth.uid()) OR (group_id IS NOT NULL AND app_private.member_of(group_id))))',t);
 EXECUTE format('CREATE POLICY secure_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (app_private.live_user() AND user_id=auth.uid() AND (group_id IS NULL OR app_private.member_of(group_id)))',t);
 EXECUTE format('CREATE POLICY secure_update ON public.%I FOR UPDATE TO authenticated USING (app_private.live_user() AND ((group_id IS NULL AND user_id=auth.uid()) OR app_private.member_of(group_id))) WITH CHECK (app_private.live_user() AND ((group_id IS NULL AND user_id=auth.uid()) OR app_private.member_of(group_id)))',t);
 EXECUTE format('CREATE POLICY secure_delete ON public.%I FOR DELETE TO authenticated USING (app_private.live_user() AND ((group_id IS NULL AND user_id=auth.uid()) OR app_private.member_of(group_id)))',t);
 END LOOP;
END $$;
CREATE POLICY secure_own_master ON public.user_item_master TO authenticated
 USING (app_private.live_user() AND user_id=auth.uid()) WITH CHECK (app_private.live_user() AND user_id=auth.uid());
CREATE POLICY secure_common_master ON public.item_master FOR SELECT TO authenticated USING (app_private.live_user());
CREATE POLICY secure_profile ON public.profiles FOR SELECT TO authenticated USING (app_private.live_user() AND user_id=auth.uid());
CREATE POLICY secure_profile_update ON public.profiles FOR UPDATE TO authenticated
 USING (app_private.live_user() AND user_id=auth.uid()) WITH CHECK (app_private.live_user() AND user_id=auth.uid());
CREATE POLICY secure_groups ON public.groups FOR SELECT TO authenticated USING (app_private.member_of(id));
CREATE POLICY secure_group_name ON public.groups FOR UPDATE TO authenticated
 USING (app_private.owner_of(id)) WITH CHECK (app_private.owner_of(id));
CREATE POLICY secure_members ON public.group_members FOR SELECT TO authenticated USING (app_private.member_of(group_id));

CREATE POLICY secure_recipes ON public.recipes TO authenticated
 USING (app_private.live_user() AND user_id=auth.uid()) WITH CHECK (app_private.live_user() AND user_id=auth.uid());
CREATE POLICY secure_recipe_items ON public.recipe_items TO authenticated
 USING (EXISTS(SELECT 1 FROM public.recipes r WHERE r.id=recipe_id AND r.user_id=auth.uid()))
 WITH CHECK (EXISTS(SELECT 1 FROM public.recipes r WHERE r.id=recipe_id AND r.user_id=auth.uid())
 AND (user_item_master_id IS NULL OR EXISTS(SELECT 1 FROM public.user_item_master m WHERE m.id=user_item_master_id AND m.user_id=auth.uid())));
CREATE POLICY secure_meal_read ON public.meal_plans FOR SELECT TO authenticated
 USING (app_private.live_user() AND ((group_id IS NULL AND user_id=auth.uid()) OR app_private.member_of(group_id)));
CREATE POLICY secure_meal_insert ON public.meal_plans FOR INSERT TO authenticated
 WITH CHECK (app_private.live_user() AND user_id=auth.uid() AND (group_id IS NULL OR app_private.member_of(group_id)));
CREATE POLICY secure_meal_update ON public.meal_plans FOR UPDATE TO authenticated
 USING (app_private.live_user() AND user_id=auth.uid() AND (group_id IS NULL OR app_private.member_of(group_id)))
 WITH CHECK (app_private.live_user() AND user_id=auth.uid() AND (group_id IS NULL OR app_private.member_of(group_id)));
CREATE POLICY secure_meal_delete ON public.meal_plans FOR DELETE TO authenticated
 USING (app_private.live_user() AND user_id=auth.uid() AND (group_id IS NULL OR app_private.member_of(group_id)));
CREATE POLICY secure_entries_read ON public.meal_plan_entries FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.meal_plans p WHERE p.id=meal_plan_id));
CREATE POLICY secure_entries_write ON public.meal_plan_entries FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.meal_plans p WHERE p.id=meal_plan_id AND p.user_id=auth.uid() AND (p.group_id IS NULL OR app_private.member_of(p.group_id))))
 WITH CHECK (EXISTS(SELECT 1 FROM public.meal_plans p WHERE p.id=meal_plan_id AND p.user_id=auth.uid() AND (p.group_id IS NULL OR app_private.member_of(p.group_id)) AND meal_date BETWEEN p.start_date AND p.end_date)
 AND (recipe_id IS NULL OR EXISTS(SELECT 1 FROM public.recipes r WHERE r.id=recipe_id AND r.user_id=auth.uid())));

ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS last_email_sent_at timestamptz;
-- Legacy invitations stay expired until explicitly reissued by an owner.
UPDATE public.invitations SET expires_at=now() WHERE expires_at IS NULL;
ALTER TABLE public.invitations ALTER COLUMN expires_at SET DEFAULT (now()+interval '7 days');
ALTER TABLE public.invitations ALTER COLUMN expires_at SET NOT NULL;
CREATE OR REPLACE FUNCTION app_private.my_email() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT lower(email) FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION app_private.my_email() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.my_email() TO authenticated;
CREATE POLICY secure_invites ON public.invitations FOR SELECT TO authenticated
 USING (app_private.owner_of(group_id) OR (app_private.live_user() AND lower(email)=app_private.my_email()));

CREATE OR REPLACE FUNCTION public.save_my_profile(p_display_name text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NOT app_private.live_user() OR (p_display_name IS NULL OR length(trim(p_display_name)) NOT BETWEEN 1 AND 100) THEN RAISE EXCEPTION 'Invalid profile' USING ERRCODE='42501'; END IF;
 INSERT INTO public.profiles(user_id,display_name,email,role,plan)
 SELECT id,trim(p_display_name),email,'user','free' FROM auth.users WHERE id=auth.uid()
 ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,email=excluded.email;
END $$;
CREATE OR REPLACE FUNCTION public.create_shopping_group(p_name text) RETURNS SETOF public.groups
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE g public.groups; BEGIN
 PERFORM 1 FROM auth.users WHERE id=auth.uid() FOR UPDATE;
 IF (SELECT count(*) FROM public.groups WHERE owner_user_id=auth.uid() AND NOT is_personal) >= coalesce((SELECT CASE WHEN role='admin' THEN 9999 WHEN plan='pro' THEN 3 ELSE 1 END FROM public.profiles WHERE user_id=auth.uid()),1) THEN RAISE EXCEPTION 'Group limit reached' USING ERRCODE='23514'; END IF;
 IF NOT app_private.live_user() OR (p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 100) THEN RAISE EXCEPTION 'Invalid group' USING ERRCODE='42501'; END IF;
 INSERT INTO public.groups(name,owner_user_id,is_personal) VALUES(trim(p_name),auth.uid(),false) RETURNING * INTO g;
 INSERT INTO public.group_members(group_id,user_id,role) VALUES(g.id,auth.uid(),'owner');
 RETURN NEXT g;
END $$;
CREATE OR REPLACE FUNCTION public.issue_shopping_invitation(p_group_id uuid,p_email text) RETURNS SETOF public.invitations
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE i public.invitations; BEGIN
 PERFORM 1 FROM auth.users WHERE id=auth.uid() FOR UPDATE;
 PERFORM 1 FROM public.groups WHERE id=p_group_id FOR UPDATE;
 IF NOT app_private.owner_of(p_group_id) OR (p_email IS NULL OR length(trim(p_email)) NOT BETWEEN 3 AND 254) OR position('@' in p_email)=0 THEN RAISE EXCEPTION 'Invitation forbidden' USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM public.invitations WHERE invited_by=auth.uid() AND created_at>now()-interval '1 hour')>=20 THEN RAISE EXCEPTION 'Invitation rate limit' USING ERRCODE='23514'; END IF;
 UPDATE public.invitations SET status='cancelled' WHERE group_id=p_group_id AND lower(email)=lower(trim(p_email)) AND status='pending';
 INSERT INTO public.invitations(group_id,email,invited_by,status,expires_at)
 VALUES(p_group_id,lower(trim(p_email)),auth.uid(),'pending',now()+interval '7 days') RETURNING * INTO i;
 RETURN NEXT i;
END $$;
CREATE OR REPLACE FUNCTION public.accept_shopping_invitation(p_invite_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE i public.invitations; BEGIN
 SELECT * INTO i FROM public.invitations WHERE id=p_invite_id;
 PERFORM 1 FROM public.groups WHERE id=i.group_id FOR UPDATE;
 SELECT * INTO i FROM public.invitations WHERE id=p_invite_id FOR UPDATE;
 IF NOT FOUND OR NOT app_private.live_user() OR i.status <> 'pending' OR i.expires_at<=now() OR lower(i.email) IS DISTINCT FROM app_private.my_email() THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.groups WHERE id=i.group_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.group_members WHERE group_id=i.group_id AND user_id=auth.uid()) AND
 (SELECT count(*) FROM public.group_members WHERE group_id=i.group_id) >= (SELECT CASE WHEN p.role='admin' THEN 9999 WHEN p.plan='pro' THEN 5 ELSE 2 END FROM public.groups g LEFT JOIN public.profiles p ON p.user_id=g.owner_user_id WHERE g.id=i.group_id) THEN RAISE EXCEPTION 'Member limit reached' USING ERRCODE='23514'; END IF;
 INSERT INTO public.group_members(group_id,user_id,role) VALUES(i.group_id,auth.uid(),'member') ON CONFLICT(group_id,user_id) DO NOTHING;
 UPDATE public.invitations SET status='accepted' WHERE id=i.id;
END $$;
CREATE OR REPLACE FUNCTION public.cancel_shopping_invitation(p_invite_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE i public.invitations; BEGIN
 SELECT * INTO i FROM public.invitations WHERE id=p_invite_id;
 PERFORM 1 FROM public.groups WHERE id=i.group_id FOR UPDATE;
 SELECT * INTO i FROM public.invitations WHERE id=p_invite_id FOR UPDATE;
 IF NOT FOUND OR NOT app_private.owner_of(i.group_id) THEN RAISE EXCEPTION 'Invitation forbidden' USING ERRCODE='42501'; END IF;
 UPDATE public.invitations SET status='cancelled' WHERE id=i.id AND status='pending';
END $$;
CREATE OR REPLACE FUNCTION public.remove_shopping_member(p_group_id uuid,p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM 1 FROM public.groups WHERE id=p_group_id FOR UPDATE;
 IF NOT app_private.live_user() OR NOT (app_private.owner_of(p_group_id) OR auth.uid()=p_user_id) THEN RAISE EXCEPTION 'Removal forbidden' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.groups WHERE id=p_group_id AND owner_user_id=p_user_id) THEN RAISE EXCEPTION 'Owner cannot leave' USING ERRCODE='42501'; END IF;
 DELETE FROM public.group_members WHERE group_id=p_group_id AND user_id=p_user_id AND role='member';
END $$;
CREATE OR REPLACE FUNCTION public.delete_empty_shopping_group(p_group_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM 1 FROM public.groups WHERE id=p_group_id FOR UPDATE;
 IF NOT app_private.owner_of(p_group_id) THEN RAISE EXCEPTION 'Deletion forbidden' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.group_members WHERE group_id=p_group_id AND user_id<>auth.uid())
 OR EXISTS(SELECT 1 FROM public.shopping_items WHERE group_id=p_group_id)
 OR EXISTS(SELECT 1 FROM public.deleted_items WHERE group_id=p_group_id)
 OR EXISTS(SELECT 1 FROM public.meal_plans WHERE group_id=p_group_id) THEN RAISE EXCEPTION 'Group still has members or data' USING ERRCODE='23514'; END IF;
 DELETE FROM public.invitations WHERE group_id=p_group_id;
 DELETE FROM public.groups WHERE id=p_group_id;
END $$;
CREATE OR REPLACE FUNCTION public.claim_shopping_invitation_email(p_invite_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE i public.invitations; BEGIN
 PERFORM 1 FROM auth.users WHERE id=auth.uid() FOR UPDATE;
 SELECT * INTO i FROM public.invitations WHERE id=p_invite_id FOR UPDATE;
 IF NOT FOUND OR NOT app_private.owner_of(i.group_id) OR i.invited_by<>auth.uid() OR i.status<>'pending' OR i.expires_at<=now() THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.invitations WHERE invited_by=auth.uid() AND last_email_sent_at>now()-interval '1 minute') THEN RETURN false; END IF;
 UPDATE public.invitations SET last_email_sent_at=now() WHERE id=i.id;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.shopping_group_directory(p_group_id uuid)
RETURNS TABLE(user_id uuid,role text,display_name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT m.user_id,m.role,coalesce(p.display_name,'メンバー') FROM public.group_members m LEFT JOIN public.profiles p ON p.user_id=m.user_id
 WHERE m.group_id=p_group_id AND app_private.member_of(p_group_id);
$$;
CREATE OR REPLACE FUNCTION public.shopping_group_entitlement(p_group_id uuid)
RETURNS TABLE(role text,plan text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p.role,p.plan FROM public.groups g JOIN public.profiles p ON p.user_id=g.owner_user_id
 WHERE g.id=p_group_id AND app_private.member_of(p_group_id);
$$;

-- Bucket reads retain current public URL compatibility; writes/deletes are
-- caller-owned and deletion refuses objects still referenced by app data.
-- Only a plain canonical public URL can prove a reference belongs to a
-- different object. Encoded/legacy/unknown forms fail closed (retain images).
CREATE OR REPLACE FUNCTION app_private.image_url_references(u text,b text,p text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$ DECLARE path text; BEGIN
 IF u IS NULL OR btrim(u)='' THEN RETURN false; END IF;
 -- Emoji placeholders are not image URLs or paths.
 IF u !~ '[[:alnum:]/%?:#\\]' THEN RETURN false; END IF;
 path := split_part(split_part(u,'#',1),'?',1);
 IF path !~ '^https?://[^/@?#[:space:]]+/storage/v1/object/public/(item-images|recipe-images)/.+' THEN RETURN true; END IF;
 path := substring(path FROM '^https?://[^/@?#[:space:]]+/storage/v1/object/public/(.*)$');
 IF path IS NULL OR path ~ '[%\\[:space:]]' OR path ~ '(^|/)\.{1,2}(/|$)' OR path LIKE '%//%' THEN RETURN true; END IF;
 RETURN path=b||'/'||p;
END $$;
REVOKE ALL ON FUNCTION app_private.image_url_references(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.image_url_references(text,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION app_private.image_referenced(b text,p text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.shopping_items WHERE app_private.image_url_references(image_url,b,p))
 OR EXISTS(SELECT 1 FROM public.user_item_master WHERE app_private.image_url_references(image_url,b,p))
 OR EXISTS(SELECT 1 FROM public.item_master WHERE app_private.image_url_references(image_url,b,p))
 OR EXISTS(SELECT 1 FROM public.recipes WHERE app_private.image_url_references(image_url,b,p)
 OR (b='recipe-images' AND image_path IS NOT NULL AND
 (image_path=p OR image_path ~ '[%?#\\[:space:]]' OR image_path ~ '(^|/)\.{1,2}(/|$)' OR image_path LIKE '%//%')));
$$;
REVOKE ALL ON FUNCTION app_private.image_referenced(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.image_referenced(text,text) TO authenticated;
-- Keep platform-managed ownership, RLS setting and table grants unchanged.
-- Only policy DDL is delegated to hosted postgres; ALTER TABLE/REVOKE on
-- managed Storage objects must not be used to force a policy migration.
CREATE POLICY secure_image_read ON storage.objects FOR SELECT TO anon,authenticated USING(bucket_id IN ('item-images','recipe-images'));
CREATE POLICY secure_image_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK (app_private.live_user() AND bucket_id IN ('item-images','recipe-images') AND split_part(name,'/',1)=auth.uid()::text AND owner_id=auth.uid()::text);
-- Replacement is refused while referenced, so a shared image cannot be changed
-- indirectly by its original uploader. Upload a new object and change the row.
CREATE POLICY secure_image_update ON storage.objects FOR UPDATE TO authenticated
 USING(app_private.live_user() AND bucket_id IN ('item-images','recipe-images') AND split_part(name,'/',1)=auth.uid()::text AND owner_id=auth.uid()::text AND NOT app_private.image_referenced(bucket_id,name))
 WITH CHECK(app_private.live_user() AND bucket_id IN ('item-images','recipe-images') AND split_part(name,'/',1)=auth.uid()::text AND owner_id=auth.uid()::text AND NOT app_private.image_referenced(bucket_id,name));
CREATE POLICY secure_image_delete ON storage.objects FOR DELETE TO authenticated
 USING(app_private.live_user() AND bucket_id IN ('item-images','recipe-images') AND split_part(name,'/',1)=auth.uid()::text AND owner_id=auth.uid()::text AND NOT app_private.image_referenced(bucket_id,name));

-- Existing public helper no longer permits anonymous execution.
CREATE OR REPLACE FUNCTION public.is_group_member(target_group_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT app_private.member_of(target_group_id); $$;
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('save_my_profile','create_shopping_group','issue_shopping_invitation',
 'accept_shopping_invitation','cancel_shopping_invitation','remove_shopping_member','delete_empty_shopping_group',
 'shopping_group_directory','shopping_group_entitlement','is_group_member','claim_shopping_invitation_email') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',r.signature);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',r.signature);
 END LOOP;
END $$;
COMMIT;
