-- READ ONLY. Only after a confirmed successful migration.
BEGIN READ ONLY;
SELECT
 (SELECT count(*) FROM (
   SELECT coalesce(m.user_id,q.user_id) FROM
    (SELECT user_id,count(*) AS n FROM public.user_item_master GROUP BY user_id)m
    FULL JOIN app_private.my_item_usage q USING(user_id)
   WHERE coalesce(m.n,0) IS DISTINCT FROM coalesce(q.item_count,0)
 ) mismatches) AS counter_mismatches,
 (SELECT count(*) FROM app_private.my_item_usage q WHERE NOT EXISTS
   (SELECT 1 FROM auth.users a WHERE a.id=q.user_id)) AS auth_absent_counters,
 (SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled) ORDER BY tgname)
  FROM pg_trigger WHERE tgrelid='public.user_item_master'::regclass
  AND tgname IN ('my_item_quota_insert','my_item_quota_delete','my_item_owner_update')) AS quota_triggers,
 (SELECT relrowsecurity FROM pg_class WHERE oid='app_private.my_item_usage'::regclass) AS private_rls,
 has_table_privilege('authenticated','app_private.my_item_usage','SELECT') AS user_can_read_counter,
 has_table_privilege('authenticated','app_private.my_item_usage','UPDATE') AS user_can_change_counter;
SELECT p.role,p.plan,app_private.my_item_limit(p.role,p.plan) AS db_limit
FROM (VALUES('user','free'),('user','special'),('user','pro'),('admin','free'))p(role,plan);
ROLLBACK;
