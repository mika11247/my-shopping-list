-- Synthetic account and Google subject only. Run against the isolated stack.
BEGIN;
DO $$
DECLARE
  account_id uuid := gen_random_uuid();
  identity_id uuid := gen_random_uuid();
  group_id_backup uuid := gen_random_uuid();
  restored_user auth.users%ROWTYPE;
  restored_identity auth.identities%ROWTYPE;
  restored_profile public.profiles%ROWTYPE;
  restored_group public.groups%ROWTYPE;
  restored_member public.group_members%ROWTYPE;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (account_id, 'authenticated', 'authenticated', 'fixture-' || account_id || '@example.test', now(),
    '{"provider":"google","providers":["google"]}', '{"name":"Fixture Google user"}')
  RETURNING * INTO restored_user;
  INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data)
  VALUES (identity_id, account_id, 'synthetic-' || identity_id, 'google',
    jsonb_build_object('sub', 'synthetic-' || identity_id, 'email', restored_user.email, 'email_verified', true))
  RETURNING * INTO restored_identity;
  INSERT INTO public.profiles (user_id, display_name, email, role, plan)
  VALUES (account_id, 'Fixture Google user', restored_user.email, 'user', 'special')
  RETURNING * INTO restored_profile;
  INSERT INTO public.groups (id, owner_user_id, name)
  VALUES (group_id_backup, account_id, 'Fixture group') RETURNING * INTO restored_group;
  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (group_id_backup, account_id, 'owner') RETURNING * INTO restored_member;

  DELETE FROM auth.users WHERE id = account_id;
  IF EXISTS (SELECT 1 FROM auth.identities WHERE id = identity_id)
    OR EXISTS (SELECT 1 FROM public.group_members WHERE group_id = group_id_backup) THEN
    RAISE EXCEPTION 'Fixture Auth cascade did not occur';
  END IF;

  -- Restore only verified account and identity data. Old credential/session
  -- state is excluded; generated columns are derived by the destination.
  INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (restored_user.id, restored_user.aud, restored_user.role, restored_user.email,
    restored_user.email_confirmed_at, restored_user.raw_app_meta_data, restored_user.raw_user_meta_data);
  INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data)
  VALUES (restored_identity.id, restored_identity.user_id, restored_identity.provider_id,
    restored_identity.provider, restored_identity.identity_data);
  INSERT INTO public.profiles SELECT (restored_profile).*;
  INSERT INTO public.groups SELECT (restored_group).*;
  INSERT INTO public.group_members SELECT (restored_member).*;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users u JOIN auth.identities i ON i.user_id = u.id
    JOIN public.profiles p ON p.user_id = u.id
    JOIN public.groups g ON g.owner_user_id = u.id
    JOIN public.group_members m ON m.group_id = g.id AND m.user_id = u.id
    WHERE u.id = account_id AND i.id = identity_id
      AND i.provider = 'google' AND i.provider_id = restored_identity.provider_id
      AND i.identity_data = restored_identity.identity_data
      AND u.raw_app_meta_data = restored_user.raw_app_meta_data
      AND u.raw_user_meta_data = restored_user.raw_user_meta_data
      AND u.email_confirmed_at = restored_user.email_confirmed_at
      AND g.id = group_id_backup AND m.role = 'owner' AND p.plan = 'special'
  ) OR EXISTS (SELECT 1 FROM auth.sessions WHERE user_id = account_id) THEN
    RAISE EXCEPTION 'Selective fixture restore failed';
  END IF;
END;
$$;
ROLLBACK;
