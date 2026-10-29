-- READ ONLY. Review only; never fixes/removes/reassigns existing data.
BEGIN READ ONLY;
SELECT jsonb_build_object(
 'postgres_version',current_setting('server_version'),
 'authorization_ready',to_regprocedure('app_private.live_user()') IS NOT NULL,
 'quota_table_exists',to_regclass('app_private.my_item_usage') IS NOT NULL,
 'quota_function_collisions',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='app_private' AND p.proname IN ('my_item_limit','enforce_my_item_quota','keep_my_item_owner')),
 'quota_trigger_collisions',(SELECT count(*) FROM pg_trigger WHERE tgrelid='public.user_item_master'::regclass
   AND tgname IN ('my_item_quota_insert','my_item_quota_delete','my_item_owner_update')),
 'items',(SELECT count(*) FROM public.user_item_master),
 'owners',(SELECT count(distinct user_id) FROM public.user_item_master),
 'auth_absent_rows',(SELECT count(*) FROM public.user_item_master m WHERE NOT EXISTS(SELECT 1 FROM auth.users a WHERE a.id=m.user_id)),
 'over_limit_owners',(SELECT count(*) FROM (SELECT m.user_id,count(*) AS n FROM public.user_item_master m GROUP BY m.user_id)c
  LEFT JOIN public.profiles p USING(user_id) WHERE c.n>CASE WHEN p.role='admin' THEN 9999 WHEN p.plan='pro' THEN 200 WHEN p.plan='special' THEN 50 ELSE 30 END)
) AS preflight;
ROLLBACK;
