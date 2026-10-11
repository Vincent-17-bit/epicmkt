-- S5 media manager: per-media alt text, variant link, status, poster, placeholder and admin removal.
-- Every stored object lives at <business_id>/<item_id>/<media_id>/<file>. attach_item_media is the only way a row is
-- created; it runs from seller-media-finalize with the service role, after the function has read the real bytes.
-- Safe to run again.

alter table public.item_media
  add column if not exists alt text,
  add column if not exists variant_id text,
  add column if not exists poster_path text,
  add column if not exists poster_time numeric(6,2),
  add column if not exists placeholder text,
  add column if not exists status text not null default 'ready',
  add column if not exists fail_reason text,
  add column if not exists removed_by_admin boolean not null default false,
  add column if not exists admin_remove_reason text;

-- Constraints are added only when missing. The path shape is NOT VALID so rows written before S5 are left alone;
-- every new write is checked.
do $$
declare c record;
begin
  for c in select * from (values
    ('item_media_alt_len_check', $c$check (alt is null or char_length(alt) <= 120)$c$),
    ('item_media_status_check', $c$check (status in ('processing','ready','failed'))$c$),
    ('item_media_poster_time_check', $c$check (poster_time is null or poster_time >= 0)$c$),
    ('item_media_placeholder_len_check', $c$check (placeholder is null or char_length(placeholder) <= 4000)$c$),
    ('item_media_variants_check', $c$check (jsonb_typeof(variants) = 'object' and octet_length(variants::text) <= 4000)$c$),
    ('item_media_poster_only_video_check', $c$check (poster_path is null or kind = 'video')$c$),
    ('item_media_path_shape_check', $c$check (path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9][A-Za-z0-9._-]{0,79}$')$c$)
  ) as t(name, def) loop
    if not exists (select 1 from pg_constraint where conname = c.name and conrelid = 'public.item_media'::regclass) then
      execute format('alter table public.item_media add constraint %I %s %s', c.name, c.def,
        case when c.name = 'item_media_path_shape_check' then 'not valid' else '' end);
    end if;
  end loop;
end $$;

create index if not exists item_media_item_sort_idx on public.item_media (item_id, sort);

-- ---- limits ----------------------------------------------------------------------------------------------------
-- Failed uploads and media an admin removed do not use up a slot. p_exclude lets a replacement swap one row for another.
drop function if exists public.media_limit_ok(uuid, text);
create or replace function public.media_limit_ok(p_item uuid, p_kind text, p_exclude uuid default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_bid uuid;
  v_plan text;
  v_limit integer;
  v_count integer;
begin
  if p_kind not in ('image','video') then return false; end if;
  select i.business_id into v_bid from public.items i where i.id = p_item;
  if v_bid is null then return false; end if;
  perform pg_advisory_xact_lock(hashtext(v_bid::text || 'item_media'));
  select b.plan_key into v_plan from public.businesses b where b.id = v_bid;
  select (case v_plan when 'premium' then g.premium else g.standard end ->>
          (case p_kind when 'image' then 'photosPerItem' else 'videosPerItem' end))::integer into v_limit
    from public.global_limits g where g.id = 1;
  select count(*) into v_count from public.item_media m
    where m.item_id = p_item and m.kind = p_kind and m.status <> 'failed' and not m.removed_by_admin
      and (p_exclude is null or m.id <> p_exclude);
  return v_limit is null or v_count < v_limit;
end $$;
revoke all on function public.media_limit_ok(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.media_limit_ok(uuid, text, uuid) to service_role;

-- ---- attach (create or replace one media) ---------------------------------------------------------------------
drop function if exists public.attach_item_media(uuid, text, text, text, integer, integer, numeric, bigint);

create or replace function public.attach_item_media(
  p_item uuid, p_media uuid, p_kind text, p_path text, p_mime text,
  p_width integer, p_height integer, p_duration numeric, p_size bigint,
  p_variants jsonb default '{}', p_poster text default null, p_poster_time numeric default null,
  p_placeholder text default null, p_alt text default null, p_variant_id text default null,
  p_status text default 'ready', p_fail_reason text default null, p_replace uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_bid uuid;
  v_folder text;
  v_sort integer;
  v_old public.item_media;
  v_removed jsonb := '[]';
  v_v record;
begin
  select i.business_id into v_bid from public.items i where i.id = p_item;
  if v_bid is null then raise exception 'item_not_found'; end if;
  v_folder := v_bid::text || '/' || p_item::text || '/' || p_media::text || '/';
  if p_path not like v_folder || '%' or p_path like '%..%' then raise exception 'path_not_owned' using errcode = '42501'; end if;
  if p_poster is not null and (p_poster not like v_folder || '%' or p_poster like '%..%') then raise exception 'path_not_owned' using errcode = '42501'; end if;
  if p_poster is not null and p_kind <> 'video' then raise exception 'poster_only_video'; end if;
  if jsonb_typeof(coalesce(p_variants, '{}')) <> 'object' then raise exception 'invalid_variants'; end if;
  for v_v in select value from jsonb_each_text(coalesce(p_variants, '{}')) loop
    if v_v.value not like v_folder || '%' or v_v.value like '%..%' then raise exception 'path_not_owned' using errcode = '42501'; end if;
  end loop;
  if p_alt is not null and char_length(p_alt) > 120 then raise exception 'alt_too_long'; end if;
  if p_status not in ('processing','ready','failed') then raise exception 'invalid_status'; end if;
  if p_variant_id is not null and not exists (
    select 1 from public.items i, jsonb_array_elements(i.variants) e where i.id = p_item and e ->> 'id' = p_variant_id
  ) then raise exception 'variant_not_found'; end if;

  if p_replace is not null then
    select * into v_old from public.item_media m where m.id = p_replace and m.item_id = p_item for update;
    if not found then raise exception 'media_not_found'; end if;
    if v_old.removed_by_admin then raise exception 'removed_by_admin'; end if;
    if v_old.kind <> p_kind then raise exception 'kind_mismatch'; end if;
  end if;

  if p_status <> 'failed' and not public.media_limit_ok(p_item, p_kind, p_replace) then
    raise exception 'limit_reached:item_media';
  end if;

  if p_replace is not null then
    v_sort := v_old.sort;
    v_removed := to_jsonb(array_remove(array[v_old.path, v_old.poster_path]::text[], null)) ||
                 coalesce((select jsonb_agg(value) from jsonb_each_text(v_old.variants)), '[]'::jsonb);
    delete from public.item_media where id = p_replace;
    p_alt := coalesce(p_alt, v_old.alt);
    p_variant_id := coalesce(p_variant_id, v_old.variant_id);
  else
    select coalesce(max(m.sort), -1) + 1 into v_sort from public.item_media m where m.item_id = p_item;
  end if;

  insert into public.item_media (id, item_id, business_id, kind, path, mime, sort, width, height, duration_sec, size_bytes,
                                 variants, poster_path, poster_time, placeholder, alt, variant_id, status, fail_reason)
  values (p_media, p_item, v_bid, p_kind, p_path, p_mime, v_sort, p_width, p_height, p_duration, p_size,
          coalesce(p_variants, '{}'), p_poster, p_poster_time, p_placeholder, nullif(trim(p_alt), ''), p_variant_id, p_status, p_fail_reason);
  return jsonb_build_object('id', p_media, 'sort', v_sort, 'removed', v_removed);
end $$;
revoke all on function public.attach_item_media(uuid, uuid, text, text, text, integer, integer, numeric, bigint, jsonb, text, numeric, text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.attach_item_media(uuid, uuid, text, text, text, integer, integer, numeric, bigint, jsonb, text, numeric, text, text, text, text, text, uuid) to service_role;

-- Sets or changes the poster of an existing video. Returns the poster it replaced so the caller can delete that file.
create or replace function public.set_media_poster(p_media uuid, p_business uuid, p_path text, p_time numeric) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_row public.item_media;
begin
  select * into v_row from public.item_media m where m.id = p_media and m.business_id = p_business for update;
  if not found then raise exception 'media_not_found'; end if;
  if v_row.kind <> 'video' then raise exception 'poster_only_video'; end if;
  if v_row.removed_by_admin then raise exception 'removed_by_admin'; end if;
  if p_path not like v_row.business_id::text || '/' || v_row.item_id::text || '/' || v_row.id::text || '/%' or p_path like '%..%' then
    raise exception 'path_not_owned' using errcode = '42501';
  end if;
  update public.item_media set poster_path = p_path, poster_time = p_time,
    status = case when status = 'processing' then 'ready' else status end
    where id = p_media;
  return v_row.poster_path;
end $$;
revoke all on function public.set_media_poster(uuid, uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.set_media_poster(uuid, uuid, text, numeric) to service_role;

-- ---- seller edits that need no file: order, alt text, variant link -----------------------------------------------
create or replace function public.seller_reorder_media(p_item uuid, p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_bid uuid := public.my_business_id();
  v_have uuid[];
begin
  if v_bid is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if not exists (select 1 from public.items i where i.id = p_item and i.business_id = v_bid) then raise exception 'item_not_found'; end if;
  perform pg_advisory_xact_lock(hashtext(v_bid::text || 'item_media'));
  select coalesce(array_agg(m.id order by m.id), '{}') into v_have from public.item_media m where m.item_id = p_item;
  if p_ids is null or cardinality(p_ids) <> cardinality(v_have)
     or (select coalesce(array_agg(x order by x), '{}') from unnest(p_ids) x) is distinct from v_have then
    raise exception 'order_mismatch';
  end if;
  update public.item_media m set sort = o.pos - 1
    from unnest(p_ids) with ordinality as o(id, pos) where m.id = o.id and m.item_id = p_item;
end $$;
revoke all on function public.seller_reorder_media(uuid, uuid[]) from public, anon;
grant execute on function public.seller_reorder_media(uuid, uuid[]) to authenticated;

create or replace function public.seller_update_media(p_media uuid, p_patch jsonb) returns public.item_media
language plpgsql security definer set search_path = public as $$
declare
  v_bid uuid := public.my_business_id();
  v_row public.item_media;
  k text;
  v_alt text;
begin
  if v_bid is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'invalid_patch'; end if;
  select * into v_row from public.item_media m where m.id = p_media and m.business_id = v_bid for update;
  if not found then raise exception 'media_not_found'; end if;
  if v_row.removed_by_admin then raise exception 'removed_by_admin'; end if;
  foreach k in array coalesce((select array_agg(x) from jsonb_object_keys(p_patch) x), '{}') loop
    if k not in ('alt', 'variantId') then raise exception 'field_not_allowed:%', k using errcode = '42501'; end if;
  end loop;
  if p_patch ? 'alt' then
    v_alt := nullif(trim(p_patch ->> 'alt'), '');
    if v_alt is not null and char_length(v_alt) > 120 then raise exception 'alt_too_long'; end if;
    v_row.alt := v_alt;
  end if;
  if p_patch ? 'variantId' then
    v_row.variant_id := nullif(p_patch ->> 'variantId', '');
    if v_row.variant_id is not null and not exists (
      select 1 from public.items i, jsonb_array_elements(i.variants) e where i.id = v_row.item_id and e ->> 'id' = v_row.variant_id
    ) then raise exception 'variant_not_found'; end if;
  end if;
  update public.item_media set alt = v_row.alt, variant_id = v_row.variant_id where id = p_media returning * into v_row;
  return v_row;
end $$;
revoke all on function public.seller_update_media(uuid, jsonb) from public, anon;
grant execute on function public.seller_update_media(uuid, jsonb) to authenticated;

-- An admin removes media with a reason. The seller sees "Removed by admin" and the reason, and cannot undo it.
create or replace function public.admin_set_media_removed(p_media uuid, p_removed boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_removed and char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;
  update public.item_media set removed_by_admin = p_removed, admin_remove_reason = case when p_removed then trim(p_reason) else null end
    where id = p_media;
  if not found then raise exception 'media_not_found'; end if;
end $$;
revoke all on function public.admin_set_media_removed(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_media_removed(uuid, boolean, text) to authenticated;

-- ---- publishing: an item needs a ready image before a seller can turn it on for shoppers ---------------------------
-- Only the off-to-on change is checked, so rows that already exist keep working. Shoppers never see an item
-- without a ready image anyway (see customer_item_media), so this is a guard for the seller, not the only defence.
create or replace function public.enforce_publish_needs_photo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.actor_role() <> 'seller' then return new; end if;
  if new.visible and not old.visible and not exists (
    select 1 from public.item_media m where m.item_id = new.id and m.kind = 'image' and m.status = 'ready' and not m.removed_by_admin
  ) then
    raise exception 'photo_required:items' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists t_items_publish_photo on public.items;
create trigger t_items_publish_photo before update of visible on public.items for each row execute function public.enforce_publish_needs_photo();

-- ---- what shoppers may read ----------------------------------------------------------------------------------
-- Ready media only, of visible items of live businesses, and only for items that have a ready image.
-- Processing, failed and admin-removed media never appear. (The view runs as its owner, so it needs no table grants.)
create or replace view public.customer_item_media as
select m.id, m.item_id, m.business_id, m.kind, m.path, m.mime, m.sort, m.width, m.height, m.duration_sec,
       m.alt, m.variant_id, m.variants, m.poster_path, m.placeholder
from public.item_media m
join public.items i on i.id = m.item_id
join public.businesses b on b.id = m.business_id
where m.status = 'ready' and not m.removed_by_admin
  and i.visible and not i.hidden_by_admin and not i.removed_by_admin
  and b.status = 'live'
  and exists (select 1 from public.item_media c where c.item_id = m.item_id and c.kind = 'image' and c.status = 'ready' and not c.removed_by_admin);
grant select on public.customer_item_media to anon, authenticated;

-- ---- storage ---------------------------------------------------------------------------------------------------
-- QuickTime is allowed when the browser can play it. HEIC is converted in the browser or refused, never stored.
update storage.buckets set allowed_mime_types = array['image/webp','image/jpeg','image/png','video/mp4','video/webm','video/quicktime']
  where id = 'seller-media';

-- A seller may only write into <their business>/<one of their items>/. A path under someone else's item, or one that
-- is not four levels deep, is refused at the door.
drop policy if exists "seller uploads own media files" on storage.objects;
create policy "seller uploads own media files" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'seller-media'
    and (storage.foldername(name))[1] = public.my_business_id()::text
    and array_length(storage.foldername(name), 1) = 3
    and exists (select 1 from public.items i where i.id::text = (storage.foldername(objects.name))[2] and i.business_id = public.my_business_id())
  );
drop policy if exists "seller updates own media files" on storage.objects;
create policy "seller updates own media files" on storage.objects for update to authenticated
  using (bucket_id = 'seller-media' and (storage.foldername(name))[1] = public.my_business_id()::text)
  with check (
    bucket_id = 'seller-media'
    and (storage.foldername(name))[1] = public.my_business_id()::text
    and array_length(storage.foldername(name), 1) = 3
    and exists (select 1 from public.items i where i.id::text = (storage.foldername(objects.name))[2] and i.business_id = public.my_business_id())
  );
