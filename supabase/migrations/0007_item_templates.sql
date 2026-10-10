-- S1: item-level category templates. categories.template describes the BUSINESS; categories.item_template lists the
-- extra fields that describe ONE product or service in that category (values live in items.attributes).
-- Adds a column only: no existing data is changed or removed. Existing rows get '[]' until scripts/seed.mjs is re-run.
-- Safe to run again.

alter table public.categories
  add column if not exists item_template jsonb not null default '[]';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'categories_item_template_check' and conrelid = 'public.categories'::regclass) then
    alter table public.categories
      add constraint categories_item_template_check check (jsonb_typeof(item_template) = 'array');
  end if;
end $$;
