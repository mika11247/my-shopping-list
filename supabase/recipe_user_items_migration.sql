-- Add My Items support to recipe_items.
-- Run this entire file once in the Supabase SQL Editor after recipe_notes.sql.

alter table public.recipe_items
  drop constraint if exists recipe_items_recipe_master_unique;

alter table public.recipe_items
  alter column item_master_id drop not null;

alter table public.recipe_items
  add column if not exists user_item_master_id bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'recipe_items_user_item_master_id_fkey'
      and conrelid = 'public.recipe_items'::regclass
  ) then
    alter table public.recipe_items
      add constraint recipe_items_user_item_master_id_fkey
      foreign key (user_item_master_id)
      references public.user_item_master(id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'recipe_items_exactly_one_master_check'
      and conrelid = 'public.recipe_items'::regclass
  ) then
    alter table public.recipe_items
      add constraint recipe_items_exactly_one_master_check check (
        (item_master_id is not null)::integer
        + (user_item_master_id is not null)::integer = 1
      );
  end if;
end
$$;

create unique index if not exists recipe_items_recipe_common_master_unique
  on public.recipe_items(recipe_id, item_master_id)
  where item_master_id is not null;

create unique index if not exists recipe_items_recipe_user_master_unique
  on public.recipe_items(recipe_id, user_item_master_id)
  where user_item_master_id is not null;

create index if not exists recipe_items_user_master_idx
  on public.recipe_items(user_item_master_id)
  where user_item_master_id is not null;

drop policy if exists "Users can insert own recipe items" on public.recipe_items;
create policy "Users can insert own recipe items" on public.recipe_items
for insert with check (
  exists (
    select 1 from public.recipes r
    where r.id = recipe_id and r.user_id = auth.uid()
  )
  and (
    user_item_master_id is null
    or exists (
      select 1 from public.user_item_master uim
      where uim.id = user_item_master_id and uim.user_id = auth.uid()
    )
  )
);

drop policy if exists "Users can update own recipe items" on public.recipe_items;
create policy "Users can update own recipe items" on public.recipe_items
for update using (
  exists (
    select 1 from public.recipes r
    where r.id = recipe_id and r.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.recipes r
    where r.id = recipe_id and r.user_id = auth.uid()
  )
  and (
    user_item_master_id is null
    or exists (
      select 1 from public.user_item_master uim
      where uim.id = user_item_master_id and uim.user_id = auth.uid()
    )
  )
);
