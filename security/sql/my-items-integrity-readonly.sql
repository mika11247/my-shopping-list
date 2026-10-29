-- READ ONLY. Run before/after in an admin session; output contains counts/hashes only.
-- Compare during a controlled no-write interval; unrelated legitimate user writes
-- can otherwise change fingerprints. Hashes are evidence, never a data backup.
BEGIN READ ONLY;
SELECT jsonb_build_object(
 'my_items',(SELECT jsonb_build_object('count',count(*),'owners',count(distinct user_id),
   'digest',md5(coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id)::text,'[]')),
   'auth_absent',count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM auth.users a WHERE a.id=m.user_id)))
   FROM public.user_item_master m),
 'recipe_references',(SELECT jsonb_build_object('count',count(*),
   'digest',md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id)::text,'[]'))) FROM public.recipe_items r),
 'recipes',(SELECT jsonb_build_object('count',count(*),
   'digest',md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id)::text,'[]'))) FROM public.recipes r),
 'shopping',(SELECT jsonb_build_object('count',count(*),
   'digest',md5(coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id)::text,'[]'))) FROM public.shopping_items s),
 'meal_plans',(SELECT jsonb_build_object('count',count(*),
   'digest',md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id)::text,'[]'))) FROM public.meal_plans p),
 'meal_entries',(SELECT jsonb_build_object('count',count(*),
   'digest',md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id)::text,'[]'))) FROM public.meal_plan_entries e),
 'storage_objects',(SELECT jsonb_build_object('count',count(*),
   'digest',md5(coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.id)::text,'[]')))
   FROM storage.objects o WHERE bucket_id IN ('item-images','recipe-images')),
 'rls_acl',(SELECT md5(coalesce(jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl)
   ORDER BY n.nspname,c.relname)::text,'[]')) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE (n.nspname='public' AND c.relkind IN ('r','p')) OR (n.nspname='storage' AND c.relname IN ('objects','buckets'))),
 'column_acl',(SELECT md5(coalesce(jsonb_agg(jsonb_build_array(n.nspname,c.relname,a.attname,a.attacl)
   ORDER BY n.nspname,c.relname,a.attname)::text,'[]')) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace WHERE a.attnum>0 AND NOT a.attisdropped
   AND ((n.nspname='public' AND c.relkind IN ('r','p')) OR (n.nspname='storage' AND c.relname IN ('objects','buckets')))),
 'policies',(SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.schemaname,p.tablename,p.policyname)::text,'[]'))
   FROM pg_policies p WHERE p.schemaname IN ('public','storage')),
 'foreign_keys',(SELECT md5(coalesce(jsonb_agg(jsonb_build_array(conrelid::regclass::text,conname,pg_get_constraintdef(oid))
   ORDER BY conrelid::regclass::text,conname)::text,'[]')) FROM pg_constraint
   WHERE contype='f' AND connamespace='public'::regnamespace),
 'existing_functions',(SELECT md5(coalesce(jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),p.prosrc,p.prosecdef,p.proconfig,p.proacl)
   ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))::text,'[]'))
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','app_private')
   AND p.proname NOT IN ('my_item_limit','enforce_my_item_quota','keep_my_item_owner'))
) AS integrity;
ROLLBACK;
