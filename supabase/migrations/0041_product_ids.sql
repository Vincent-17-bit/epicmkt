-- One id per product, made by the database and never changed.
--
-- Every row in public.items already gets a uuid primary key, so two products can never share an id. Two gaps remained:
--   * a seller can insert into items directly through row security (the "seller inserts own items" policy), and that
--     insert could name its own id. An id the caller chose is not an id the system made, and a chosen id can be
--     guessed or reused, so an insert from a seller or a visitor now always gets a fresh id from the database.
--   * nothing stopped an update from rewriting an id, which would break every link, flash sale, offer and history
--     row that traces the product by it. An id can no longer change.
--
-- Code that runs as the database owner (the seller_save_item, seller_duplicate_item and seller_import_items
-- functions, migrations, seed data) already takes the default, so nothing there changes.

create or replace function public.items_assign_id() returns trigger
language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.id := gen_random_uuid();
  end if;
  return new;
end $$;

drop trigger if exists t_items_assign_id on public.items;
create trigger t_items_assign_id before insert on public.items for each row execute function public.items_assign_id();

create or replace function public.items_id_immutable() returns trigger
language plpgsql as $$
begin
  if new.id is distinct from old.id then
    raise exception 'item_id_immutable' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists t_items_id_immutable on public.items;
create trigger t_items_id_immutable before update of id on public.items for each row execute function public.items_id_immutable();
