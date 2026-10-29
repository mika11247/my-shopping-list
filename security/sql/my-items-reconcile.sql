-- ADMIN ONLY. Derived quota metadata rebuild after an authorized restore/repair.
-- Not a rollback and not part of normal migration application.
-- Preserve every user_item_master row, including owners absent from auth.users.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '60s';
LOCK TABLE public.user_item_master IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO app_private.my_item_usage(user_id,item_count)
SELECT user_id,count(*) FROM public.user_item_master GROUP BY user_id
ON CONFLICT(user_id) DO UPDATE SET item_count=excluded.item_count;
DELETE FROM app_private.my_item_usage q
WHERE NOT EXISTS (SELECT 1 FROM public.user_item_master m WHERE m.user_id=q.user_id);
COMMIT;
