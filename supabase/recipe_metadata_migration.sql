-- Recipe metadata for filtering and future meal-planning integrations.
-- Run this entire file once in the Supabase SQL Editor.

alter table public.recipes
  add column if not exists category text,
  add column if not exists servings integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'recipes_category_format_check'
      and conrelid = 'public.recipes'::regclass
  ) then
    alter table public.recipes
      add constraint recipes_category_format_check check (
        category is null
        or (char_length(trim(category)) between 1 and 50)
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'recipes_servings_positive_check'
      and conrelid = 'public.recipes'::regclass
  ) then
    alter table public.recipes
      add constraint recipes_servings_positive_check check (
        servings is null or servings >= 1
      );
  end if;
end
$$;

create index if not exists recipes_user_category_idx
  on public.recipes(user_id, category);
