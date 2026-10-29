-- ADMIN-ONLY EMERGENCY WITHDRAWAL, NOT A DATA RESTORE.
-- Prepared and tested locally only. Do not execute automatically in production.
-- Requires separate approval, caller write suspension, and exact installed-object verification.
-- Original rows/images/recipes/RLS/Storage policies remain; the quota bypass reopens.
-- Missing/unexpected dependencies fail the transaction. Never add CASCADE to force it.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '60s';
LOCK TABLE public.user_item_master IN SHARE ROW EXCLUSIVE MODE;
DROP TRIGGER my_item_quota_insert ON public.user_item_master;
DROP TRIGGER my_item_quota_delete ON public.user_item_master;
DROP TRIGGER my_item_owner_update ON public.user_item_master;
DROP FUNCTION app_private.enforce_my_item_quota();
DROP FUNCTION app_private.keep_my_item_owner();
DROP FUNCTION app_private.my_item_limit(text,text);
DROP TABLE app_private.my_item_usage;
COMMIT;
