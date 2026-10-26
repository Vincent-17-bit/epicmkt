-- Pictures move to Cloudinary. Supabase keeps the data (messages, payments, listings) and the paths that point at pictures.
--
-- A stored picture value is now one of two things (see shared/src/seller/images.js):
--   Cloudinary public id   "<businessId>/<itemId>/<uuid>"        no file extension
--   legacy Supabase path   "<businessId>/<itemId>/<uuid>.jpg"    always has one
-- Nothing about item_media.path, businesses.logo_path or the public views changes shape, so every existing query,
-- index, snapshot and policy keeps working. This migration adds only what Cloudinary needs around them:
--
--   media_uploads  one row per signed upload, written BEFORE the browser sends the file. It binds a public id to a business,
--                  an item and a purpose, so finalize can refuse an id the server never issued.
--   media_gc       a queue of Cloudinary files nobody points at any more (a deleted photo, a replaced logo, an upload that was
--                  never finished). A trigger fills it in the same transaction as the change, so a crash cannot leave a file
--                  behind; the media-gc function drains it. Same idea as a transactional outbox.
--
-- Both tables are reachable only by the service role (the edge functions). RLS is on with no policies, and no grants.

create or replace function public.is_cloudinary_id(p text) returns boolean
language sql immutable as $$
  select p is not null
    and p <> ''
    and char_length(p) <= 300
    and p !~* '^(blob:|data:|https?:)'
    and position('..' in p) = 0
    and p !~ '\.[A-Za-z0-9]{2,5}$'
$$;

create table if not exists public.media_uploads (
  public_id text primary key,
  business_id uuid not null,
  item_id uuid,
  purpose text not null check (purpose in ('item_photo', 'logo', 'cover')),
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  check (public.is_cloudinary_id(public_id)),
  check (public_id like business_id::text || '/%'),
  check ((purpose = 'item_photo') = (item_id is not null))
);
-- The sweep looks only at old rows; the partial index keeps that cheap however many finished uploads there are.
create index if not exists media_uploads_created_idx on public.media_uploads (created_at);
create index if not exists media_uploads_pending_idx on public.media_uploads (created_at) where finalized_at is null;
create index if not exists media_uploads_business_idx on public.media_uploads (business_id, created_at desc);

create table if not exists public.media_gc (
  public_id text primary key,
  reason text not null,
  queued_at timestamptz not null default now(),
  attempts integer not null default 0,
  next_try_at timestamptz not null default now(),
  last_error text
);
create index if not exists media_gc_due_idx on public.media_gc (next_try_at);

alter table public.media_uploads enable row level security;
alter table public.media_gc enable row level security;
revoke all on public.media_uploads, public.media_gc from public, anon, authenticated;
grant select, insert, update, delete on public.media_uploads, public.media_gc to service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- Outbox triggers: whatever stops pointing at a Cloudinary file queues that file for deletion, in the same transaction.
-- SECURITY DEFINER so a seller deleting their own photo (row level security lets them) can still write the queue.
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function public.media_gc_from_item_media() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.kind = 'image' and public.is_cloudinary_id(old.path) then
    insert into public.media_gc (public_id, reason) values (old.path, 'photo_removed') on conflict (public_id) do nothing;
  end if;
  return null;
end $$;

drop trigger if exists item_media_gc on public.item_media;
create trigger item_media_gc after delete on public.item_media
  for each row execute function public.media_gc_from_item_media();

create or replace function public.media_gc_from_business() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into public.media_gc (public_id, reason)
    select x, 'business_deleted' from unnest(array[old.logo_path, old.cover_path]) as x
    where public.is_cloudinary_id(x)
    on conflict (public_id) do nothing;
    return null;
  end if;
  insert into public.media_gc (public_id, reason)
  select x, 'shop_image_replaced'
  from unnest(array[
    case when old.logo_path is distinct from new.logo_path then old.logo_path end,
    case when old.cover_path is distinct from new.cover_path then old.cover_path end
  ]) as x
  where public.is_cloudinary_id(x)
  on conflict (public_id) do nothing;
  return null;
end $$;

drop trigger if exists businesses_media_gc_update on public.businesses;
create trigger businesses_media_gc_update after update of logo_path, cover_path on public.businesses
  for each row execute function public.media_gc_from_business();
drop trigger if exists businesses_media_gc_delete on public.businesses;
create trigger businesses_media_gc_delete after delete on public.businesses
  for each row execute function public.media_gc_from_business();

-- ---------------------------------------------------------------------------------------------------------------------
-- Service-only RPCs used by the edge functions.
-- ---------------------------------------------------------------------------------------------------------------------

-- Called by seller-media-sign BEFORE the browser gets its signature. The id must sit under the business's own prefix, and an
-- item photo must belong to an item of that business, so a seller can never be signed an id inside someone else's folder.
create or replace function public.media_register_upload(p_business uuid, p_item uuid, p_purpose text, p_public_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_purpose not in ('item_photo', 'logo', 'cover') then raise exception 'invalid_purpose'; end if;
  if not public.is_cloudinary_id(p_public_id) or p_public_id not like p_business::text || '/%' then raise exception 'path_not_owned' using errcode = '42501'; end if;
  if p_purpose = 'item_photo' then
    if p_item is null or not exists (select 1 from public.items i where i.id = p_item and i.business_id = p_business) then raise exception 'item_not_found'; end if;
  elsif p_item is not null then
    raise exception 'invalid_purpose';
  end if;
  insert into public.media_uploads (public_id, business_id, item_id, purpose) values (p_public_id, p_business, p_item, p_purpose);
end $$;

-- Called by seller-media-finalize once Cloudinary's own signature on the upload response has been checked.
-- Returns the purpose and item the id was issued for; raises upload_not_found for an id this business was never signed.
create or replace function public.media_confirm_upload(p_business uuid, p_public_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u public.media_uploads;
begin
  select * into u from public.media_uploads m where m.public_id = p_public_id and m.business_id = p_business for update;
  if not found then raise exception 'upload_not_found'; end if;
  update public.media_uploads m set finalized_at = coalesce(m.finalized_at, now()) where m.public_id = p_public_id;
  return jsonb_build_object('purpose', u.purpose, 'item_id', u.item_id);
end $$;

-- Hands the worker the files that are due, and leases them for ten minutes so two workers never take the same file.
-- Anything that something still points at is dropped from the queue instead of being handed out: the queue can be wrong, a delete cannot.
create or replace function public.media_gc_claim(p_limit integer default 50) returns table (public_id text)
language plpgsql security definer set search_path = public as $$
begin
  delete from public.media_gc g
  where g.next_try_at <= now()
    and (exists (select 1 from public.item_media m where m.path = g.public_id)
      or exists (select 1 from public.businesses b where b.logo_path = g.public_id or b.cover_path = g.public_id));
  return query
  update public.media_gc g set attempts = g.attempts + 1, next_try_at = now() + interval '10 minutes'
  where g.public_id in (select q.public_id from public.media_gc q where q.next_try_at <= now() order by q.next_try_at, q.queued_at limit greatest(1, least(coalesce(p_limit, 50), 100)) for update skip locked)
  returning g.public_id;
end $$;

create or replace function public.media_gc_done(p_ids text[]) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.media_gc where public_id = any (p_ids);
  get diagnostics n = row_count;
  return n;
end $$;

-- A failed delete is retried with a growing pause: 2, 4, 8 ... minutes, never more than six hours.
create or replace function public.media_gc_fail(p_ids text[], p_error text) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.media_gc g
  set next_try_at = now() + least(interval '6 hours', make_interval(mins => power(2, least(g.attempts, 10))::integer)),
      last_error = left(coalesce(p_error, ''), 300)
  where g.public_id = any (p_ids);
  get diagnostics n = row_count;
  return n;
end $$;

-- Queues files for deletion by hand (the migration script uses it for pictures it has copied and verified).
create or replace function public.media_gc_enqueue(p_ids text[], p_reason text) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.media_gc (public_id, reason)
  select x, left(coalesce(p_reason, 'manual'), 60) from unnest(p_ids) as x where public.is_cloudinary_id(x)
  on conflict (public_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Uploads older than the grace period (an hour) are settled: one that nothing points at is queued for deletion, one that
-- something points at is simply forgotten (the triggers above own its deletion from then on). Either way the row goes, which
-- keeps this table small however many photos are uploaded. Returns how many orphans were queued.
create or replace function public.media_sweep_orphans(p_grace interval default interval '1 hour') returns integer
language plpgsql security definer set search_path = public as $$
declare queued integer;
begin
  with put as (
    insert into public.media_gc (public_id, reason)
    select u.public_id, 'unattached_upload' from public.media_uploads u
    where u.created_at < now() - p_grace
      and not exists (select 1 from public.item_media m where m.path = u.public_id)
      and not exists (select 1 from public.businesses b where b.logo_path = u.public_id or b.cover_path = u.public_id)
    on conflict (public_id) do nothing
    returning 1
  )
  select count(*) into queued from put;
  delete from public.media_uploads where created_at < now() - p_grace;
  return queued;
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'media_register_upload(uuid, uuid, text, text)', 'media_confirm_upload(uuid, text)', 'media_gc_claim(integer)',
    'media_gc_done(text[])', 'media_gc_fail(text[], text)', 'media_gc_enqueue(text[], text)', 'media_sweep_orphans(interval)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;
