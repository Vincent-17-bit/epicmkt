alter table public.items
  add column if not exists track_stock boolean not null default false,
  add column if not exists low_stock_threshold integer not null default 3 check (low_stock_threshold >= 0),
  add column if not exists show_stock_count boolean not null default false,
  add column if not exists restock_at timestamptz,
  add column if not exists available_from timestamptz,
  add column if not exists season jsonb,
  add column if not exists price_confirmed_at timestamptz not null default now();

alter table public.item_media
  add column if not exists variants jsonb not null default '{}',
  add column if not exists width integer check (width > 0),
  add column if not exists height integer check (height > 0),
  add column if not exists duration_sec numeric(8,2) check (duration_sec >= 0),
  add column if not exists size_bytes bigint check (size_bytes >= 0);

alter table public.messages add column if not exists read_at timestamptz;

create table if not exists public.item_history (
  id bigint generated always as identity primary key,
  item_id uuid not null references public.items(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  field text not null,
  old_value text,
  new_value text,
  changed_by uuid,
  actor_role text not null check (actor_role in ('seller','admin','system')),
  created_at timestamptz not null default now()
);
create index if not exists item_history_item_idx on public.item_history (item_id, created_at desc);
create index if not exists item_history_business_idx on public.item_history (business_id, created_at desc);

create table if not exists public.seller_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  settings jsonb not null default '{}' check (octet_length(settings::text) <= 20000),
  updated_at timestamptz not null default now()
);

create table if not exists public.seller_otps (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  purpose text not null check (purpose in ('forgot_password','change_password')),
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  used boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists seller_otps_lookup_idx on public.seller_otps (business_id, purpose, created_at desc);

create table if not exists public.login_events (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  success boolean not null,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists login_events_business_idx on public.login_events (business_id, created_at desc);

create table if not exists public.auth_attempts (
  key text primary key,
  failures integer not null default 0,
  locked_until timestamptz,
  last_failure_at timestamptz not null default now()
);

drop trigger if exists t_seller_settings_touch on public.seller_settings;
create trigger t_seller_settings_touch before update on public.seller_settings for each row execute function public.touch_updated_at();

alter table public.item_history enable row level security;
alter table public.seller_settings enable row level security;
alter table public.seller_otps enable row level security;
alter table public.login_events enable row level security;
alter table public.auth_attempts enable row level security;

drop policy if exists "seller reads own item history" on public.item_history;
create policy "seller reads own item history" on public.item_history for select to authenticated using (business_id = public.my_business_id());
drop policy if exists "admin reads item history" on public.item_history;
create policy "admin reads item history" on public.item_history for select to authenticated using (public.is_admin());

drop policy if exists "seller reads own login events" on public.login_events;
create policy "seller reads own login events" on public.login_events for select to authenticated using (business_id = public.my_business_id());
drop policy if exists "admin reads login events" on public.login_events;
create policy "admin reads login events" on public.login_events for select to authenticated using (public.is_admin());

drop policy if exists "seller reads own settings" on public.seller_settings;
create policy "seller reads own settings" on public.seller_settings for select to authenticated using (business_id = public.my_business_id());
drop policy if exists "seller inserts own settings" on public.seller_settings;
create policy "seller inserts own settings" on public.seller_settings for insert to authenticated with check (business_id = public.my_business_id());
drop policy if exists "seller updates own settings" on public.seller_settings;
create policy "seller updates own settings" on public.seller_settings for update to authenticated using (business_id = public.my_business_id()) with check (business_id = public.my_business_id());
drop policy if exists "admin all settings seller" on public.seller_settings;
create policy "admin all settings seller" on public.seller_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.seller_otps, public.auth_attempts from public, anon, authenticated;
revoke all on public.item_history, public.login_events from public, anon;
grant select on public.item_history, public.login_events to authenticated;
grant select, insert, update on public.seller_settings to authenticated;
grant all on public.item_history, public.seller_settings, public.seller_otps, public.login_events, public.auth_attempts to service_role;
grant all on all sequences in schema public to service_role;

create or replace function public.actor_role() returns text
language sql stable set search_path = public as
$$ select case when auth.uid() is null then 'system' when public.is_admin() then 'admin' else 'seller' end $$;
grant execute on function public.actor_role() to authenticated, service_role;

create or replace function public.write_audit(p_business uuid, p_action text, p_entity text, p_entity_id text, p_data jsonb default '{}')
returns void language sql security definer set search_path = public as
$$ insert into public.audit_log (business_id, actor_id, actor_role, action, entity, entity_id, data)
   values (p_business, auth.uid(), public.actor_role(), p_action, p_entity, p_entity_id, coalesce(p_data, '{}')) $$;
revoke all on function public.write_audit(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.write_audit(uuid, text, text, text, jsonb) to service_role;

create or replace function public.notify_admin(p_kind text, p_business uuid, p_data jsonb default '{}')
returns void language sql security definer set search_path = public as
$$ insert into public.admin_notifications (kind, business_id, data) values (p_kind, p_business, coalesce(p_data, '{}')) $$;
revoke all on function public.notify_admin(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.notify_admin(text, uuid, jsonb) to service_role;

create or replace function public.normalize_phone_ke(p text) returns text
language sql immutable as
$$ select case when m is null then null else '+254' || m[1] end
   from (select regexp_match(regexp_replace(coalesce(p, ''), '[ ()\-.]', '', 'g'), '^(?:\+?254|0)([71][0-9]{8})$') as m) s $$;

create or replace function public.apply_stock_rules() returns trigger
language plpgsql as $$
begin
  if new.track_stock and new.stock_count is not null and new.availability in ('available','limited_stock','out_of_stock') then
    new.availability := case
      when new.stock_count <= 0 then 'out_of_stock'
      when new.stock_count <= new.low_stock_threshold then 'limited_stock'
      else 'available'
    end;
  end if;
  return new;
end $$;
drop trigger if exists t_items_stock on public.items;
create trigger t_items_stock before insert or update on public.items for each row execute function public.apply_stock_rules();

create or replace function public.stamp_price_confirmed() returns trigger
language plpgsql as $$
begin
  if (new.price, new.price_max, new.price_type, new.sale_price) is distinct from (old.price, old.price_max, old.price_type, old.sale_price) then
    new.price_confirmed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists t_items_price_stamp on public.items;
create trigger t_items_price_stamp before update on public.items for each row execute function public.stamp_price_confirmed();

create or replace function public.log_item_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
  f text;
begin
  foreach f in array array['name','price','price_max','price_type','unit','sale_price','availability','stock_count','visible','hidden_by_admin'] loop
    if o -> f is distinct from n -> f then
      insert into public.item_history (item_id, business_id, field, old_value, new_value, changed_by, actor_role)
      values (new.id, new.business_id, f, o ->> f, n ->> f, auth.uid(), public.actor_role());
    end if;
  end loop;
  return null;
end $$;
drop trigger if exists t_items_history on public.items;
create trigger t_items_history after update on public.items for each row execute function public.log_item_changes();

create or replace function public.protect_admin_cols() returns trigger
language plpgsql as $$
declare
  o jsonb;
  n jsonb := to_jsonb(new);
  k text;
begin
  if public.actor_role() <> 'seller' then return new; end if;
  if tg_op = 'INSERT' then
    if new.hidden_by_admin or new.removed_by_admin or new.admin_hide_reason is not null
       or new.admin_status is not null or new.admin_reason is not null then
      raise exception 'admin_columns_protected' using errcode = '42501';
    end if;
  else
    o := to_jsonb(old);
    foreach k in array array['hidden_by_admin','admin_hide_reason','admin_status','admin_reason','removed_by_admin'] loop
      if o -> k is distinct from n -> k then
        raise exception 'admin_columns_protected' using errcode = '42501';
      end if;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists t_items_protect on public.items;
create trigger t_items_protect before insert or update on public.items for each row execute function public.protect_admin_cols();
drop trigger if exists t_faqs_protect on public.faqs;
create trigger t_faqs_protect before insert or update on public.faqs for each row execute function public.protect_admin_cols();
drop trigger if exists t_offers_protect on public.offers;
create trigger t_offers_protect before insert or update on public.offers for each row execute function public.protect_admin_cols();

create or replace function public.enforce_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cat text;
  v_plan text;
  v_limit integer;
  v_count integer;
  v_tbl text := tg_table_name;
begin
  if public.actor_role() <> 'seller' then return new; end if;
  if v_tbl = 'offers' then
    if not new.active then return new; end if;
    if tg_op = 'UPDATE' and old.active then return new; end if;
  end if;
  perform pg_advisory_xact_lock(hashtext(new.business_id::text || v_tbl));
  select b.category_id, b.plan_key into v_cat, v_plan from public.businesses b where b.id = new.business_id;
  if v_tbl = 'items' then
    select p.items_limit into v_limit from public.plans p where p.category_id = v_cat and p.plan_key = v_plan;
    if not found then v_limit := 0; end if;
    select count(*) into v_count from public.items i where i.business_id = new.business_id;
  elsif v_tbl = 'faqs' then
    select (case v_plan when 'premium' then g.premium else g.standard end ->> 'faqs')::integer into v_limit
      from public.global_limits g where g.id = 1;
    select count(*) into v_count from public.faqs f where f.business_id = new.business_id;
  else
    select (case v_plan when 'premium' then g.premium else g.standard end ->> 'activeOffers')::integer into v_limit
      from public.global_limits g where g.id = 1;
    select count(*) into v_count from public.offers o where o.business_id = new.business_id and o.active;
  end if;
  if v_limit is not null and v_count >= v_limit then
    raise exception 'limit_reached:%', v_tbl using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists t_items_limit on public.items;
create trigger t_items_limit before insert on public.items for each row execute function public.enforce_limit();
drop trigger if exists t_faqs_limit on public.faqs;
create trigger t_faqs_limit before insert on public.faqs for each row execute function public.enforce_limit();
drop trigger if exists t_offers_limit on public.offers;
create trigger t_offers_limit before insert or update of active on public.offers for each row execute function public.enforce_limit();

create or replace function public.media_limit_ok(p_item uuid, p_kind text) returns boolean
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
  select count(*) into v_count from public.item_media m where m.item_id = p_item and m.kind = p_kind;
  return v_limit is null or v_count < v_limit;
end $$;
revoke all on function public.media_limit_ok(uuid, text) from public, anon, authenticated;
grant execute on function public.media_limit_ok(uuid, text) to service_role;

create or replace function public.attach_item_media(
  p_item uuid, p_kind text, p_path text, p_mime text, p_width integer, p_height integer, p_duration numeric, p_size bigint
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_bid uuid;
  v_id uuid;
  v_sort integer;
begin
  select i.business_id into v_bid from public.items i where i.id = p_item;
  if v_bid is null then raise exception 'item_not_found'; end if;
  if p_path not like v_bid::text || '/%' then raise exception 'path_not_owned' using errcode = '42501'; end if;
  if not public.media_limit_ok(p_item, p_kind) then raise exception 'limit_reached:item_media'; end if;
  select count(*) into v_sort from public.item_media m where m.item_id = p_item;
  insert into public.item_media (item_id, business_id, kind, path, mime, sort, width, height, duration_sec, size_bytes)
  values (p_item, v_bid, p_kind, p_path, p_mime, v_sort, p_width, p_height, p_duration, p_size)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.attach_item_media(uuid, text, text, text, integer, integer, numeric, bigint) from public, anon, authenticated;
grant execute on function public.attach_item_media(uuid, text, text, text, integer, integer, numeric, bigint) to service_role;

create or replace function public.seller_update_profile(p_patch jsonb) returns public.businesses
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_b public.businesses;
  k text;
  v text;
  e jsonb;
  allowed text[] := array['tagline','description','whatsapp','email','socials','amenities','payment_methods','delivery_area','address','logo_path','cover_path','tags','announcement','profile'];
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'invalid_patch'; end if;
  select * into v_b from public.businesses where id = v_id for update;
  foreach k in array coalesce((select array_agg(x) from jsonb_object_keys(p_patch) x), '{}') loop
    if not (k = any (allowed)) then raise exception 'field_not_allowed:%', k using errcode = '42501'; end if;
  end loop;

  foreach k in array array['tagline','description','whatsapp','email','delivery_area','address','logo_path','cover_path','announcement'] loop
    if p_patch ? k and jsonb_typeof(p_patch -> k) not in ('string','null') then raise exception 'invalid_%', k; end if;
  end loop;
  if p_patch ? 'tagline' and char_length(coalesce(p_patch ->> 'tagline', '')) > 120 then raise exception 'invalid_tagline'; end if;
  if p_patch ? 'description' and char_length(coalesce(p_patch ->> 'description', '')) > 2000 then raise exception 'invalid_description'; end if;
  if p_patch ? 'delivery_area' and char_length(coalesce(p_patch ->> 'delivery_area', '')) > 200 then raise exception 'invalid_delivery_area'; end if;
  if p_patch ? 'address' and char_length(coalesce(p_patch ->> 'address', '')) > 200 then raise exception 'invalid_address'; end if;
  if p_patch ? 'whatsapp' and p_patch ->> 'whatsapp' is not null and public.normalize_phone_ke(p_patch ->> 'whatsapp') is null then raise exception 'invalid_whatsapp'; end if;
  if p_patch ? 'email' and p_patch ->> 'email' is not null and (char_length(p_patch ->> 'email') > 120 or p_patch ->> 'email' !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'invalid_email'; end if;
  foreach k in array array['logo_path','cover_path'] loop
    if p_patch ? k and p_patch ->> k is not null and (char_length(p_patch ->> k) > 300 or p_patch ->> k not like v_id::text || '/%' or p_patch ->> k like '%..%') then raise exception 'invalid_%', k; end if;
  end loop;
  if p_patch ? 'announcement' and p_patch ->> 'announcement' is not null then
    if v_b.plan_key <> 'premium' then raise exception 'premium_only' using errcode = '42501'; end if;
    if char_length(p_patch ->> 'announcement') > 280 then raise exception 'invalid_announcement'; end if;
  end if;
  if p_patch ? 'socials' then
    if jsonb_typeof(p_patch -> 'socials') <> 'object' or (select count(*) from jsonb_object_keys(p_patch -> 'socials')) > 10 then raise exception 'invalid_socials'; end if;
    for e in select value from jsonb_each(p_patch -> 'socials') loop
      if jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') > 200 then raise exception 'invalid_socials'; end if;
    end loop;
  end if;
  foreach k in array array['amenities','payment_methods','tags'] loop
    if p_patch ? k then
      if jsonb_typeof(p_patch -> k) <> 'array' or jsonb_array_length(p_patch -> k) > (case when k = 'tags' then 10 else 30 end) then raise exception 'invalid_%', k; end if;
      for e in select value from jsonb_array_elements(p_patch -> k) loop
        if jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') > (case when k = 'tags' then 30 else 40 end) then raise exception 'invalid_%', k; end if;
      end loop;
    end if;
  end loop;
  if p_patch ? 'profile' and (jsonb_typeof(p_patch -> 'profile') <> 'object' or octet_length((p_patch -> 'profile')::text) > 10000) then raise exception 'invalid_profile'; end if;

  update public.businesses b set
    tagline = case when p_patch ? 'tagline' then nullif(btrim(p_patch ->> 'tagline'), '') else b.tagline end,
    description = case when p_patch ? 'description' then nullif(btrim(p_patch ->> 'description'), '') else b.description end,
    whatsapp = case when p_patch ? 'whatsapp' then public.normalize_phone_ke(p_patch ->> 'whatsapp') else b.whatsapp end,
    email = case when p_patch ? 'email' then nullif(btrim(p_patch ->> 'email'), '') else b.email end,
    socials = case when p_patch ? 'socials' then p_patch -> 'socials' else b.socials end,
    amenities = case when p_patch ? 'amenities' then p_patch -> 'amenities' else b.amenities end,
    payment_methods = case when p_patch ? 'payment_methods' then p_patch -> 'payment_methods' else b.payment_methods end,
    delivery_area = case when p_patch ? 'delivery_area' then nullif(btrim(p_patch ->> 'delivery_area'), '') else b.delivery_area end,
    address = case when p_patch ? 'address' then nullif(btrim(p_patch ->> 'address'), '') else b.address end,
    logo_path = case when p_patch ? 'logo_path' then p_patch ->> 'logo_path' else b.logo_path end,
    cover_path = case when p_patch ? 'cover_path' then p_patch ->> 'cover_path' else b.cover_path end,
    tags = case when p_patch ? 'tags' then array(select jsonb_array_elements_text(p_patch -> 'tags')) else b.tags end,
    announcement = case when p_patch ? 'announcement' then nullif(btrim(p_patch ->> 'announcement'), '') else b.announcement end,
    profile = case when p_patch ? 'profile' then p_patch -> 'profile' else b.profile end
  where b.id = v_id
  returning * into v_b;

  perform public.write_audit(v_id, 'profile_updated', 'business', v_id::text,
    jsonb_build_object('fields', coalesce((select jsonb_agg(x) from jsonb_object_keys(p_patch) x), '[]')));
  return v_b;
end $$;

create or replace function public.seller_request_change(p_field text, p_value text) returns public.change_requests
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_b public.businesses;
  v_new text := btrim(coalesce(p_value, ''));
  v_old text;
  r public.change_requests;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_field is null or p_field not in ('name','category_id','phone','town','pin','licence') then
    raise exception 'field_not_allowed:%', coalesce(p_field, '') using errcode = '42501';
  end if;
  select * into v_b from public.businesses where id = v_id;
  if p_field = 'name' and char_length(v_new) not between 2 and 100 then raise exception 'invalid_name'; end if;
  if p_field = 'category_id' and not exists (select 1 from public.categories c where c.id = v_new and c.active) then raise exception 'invalid_category'; end if;
  if p_field = 'phone' then
    v_new := public.normalize_phone_ke(v_new);
    if v_new is null then raise exception 'invalid_phone'; end if;
  end if;
  if p_field = 'town' and char_length(v_new) not between 2 and 60 then raise exception 'invalid_town'; end if;
  if p_field = 'pin' then
    v_new := upper(v_new);
    if v_new !~ '^[AP][0-9]{9}[A-Z]$' then raise exception 'invalid_pin'; end if;
  end if;
  if p_field = 'licence' and char_length(v_new) not between 3 and 60 then raise exception 'invalid_licence'; end if;
  v_old := to_jsonb(v_b) ->> p_field;
  if v_old is not distinct from v_new then raise exception 'no_change'; end if;
  begin
    insert into public.change_requests (business_id, field, old_value, new_value)
    values (v_id, p_field, v_old, v_new) returning * into r;
  exception when unique_violation then
    raise exception 'change_already_pending';
  end;
  perform public.write_audit(v_id, 'change_requested', 'change_request', r.id::text, jsonb_build_object('field', p_field));
  perform public.notify_admin('change_request', v_id, jsonb_build_object('change_id', r.id, 'field', p_field));
  return r;
end $$;

create or replace function public.seller_cancel_change(p_id uuid) returns public.change_requests
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  r public.change_requests;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  update public.change_requests c set status = 'cancelled', decided_at = now()
  where c.id = p_id and c.business_id = v_id and c.status = 'pending' returning * into r;
  if not found then raise exception 'not_found_or_not_pending'; end if;
  perform public.write_audit(v_id, 'change_cancelled', 'change_request', r.id::text, jsonb_build_object('field', r.field));
  return r;
end $$;

create or replace function public.seller_confirm_prices() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_n integer;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  update public.items i set price_confirmed_at = now() where i.business_id = v_id;
  get diagnostics v_n = row_count;
  perform public.write_audit(v_id, 'prices_confirmed', 'business', v_id::text, jsonb_build_object('items', v_n));
  return v_n;
end $$;

create or replace function public.seller_reply_flag(p_flag uuid, p_reply text) returns public.flags
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_reply text := btrim(coalesce(p_reply, ''));
  r public.flags;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if char_length(v_reply) not between 3 and 1000 then raise exception 'invalid_reply'; end if;
  update public.flags f set seller_reply = v_reply, replied_at = now(), status = 'replied'
  where f.id = p_flag and f.business_id = v_id and f.status = 'open' returning * into r;
  if not found then raise exception 'not_found_or_not_open'; end if;
  perform public.write_audit(v_id, 'flag_replied', 'flag', r.id::text, '{}');
  perform public.notify_admin('flag_reply', v_id, jsonb_build_object('flag_id', r.id));
  return r;
end $$;

create or replace function public.seller_mark_read(p_ids uuid[] default null) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_n integer;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  update public.messages m set read_at = now()
  where m.business_id = v_id and m.read_at is null and (p_ids is null or m.id = any (p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.seller_pause_listing(p_pause boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_status text;
  v_to text := case when p_pause then 'paused' else 'live' end;
  v_from text := case when p_pause then 'live' else 'paused' end;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  update public.businesses b set status = v_to where b.id = v_id and b.status = v_from returning b.status into v_status;
  if not found then raise exception 'invalid_status'; end if;
  perform public.write_audit(v_id, case when p_pause then 'listing_paused' else 'listing_resumed' end, 'business', v_id::text, '{}');
  return v_status;
end $$;

create or replace function public.seller_request_deletion(p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_name text;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select b.name into v_name from public.businesses b where b.id = v_id for update;
  if lower(btrim(coalesce(p_name, ''))) <> lower(btrim(v_name)) then raise exception 'name_mismatch'; end if;
  update public.change_requests c set status = 'cancelled', decided_at = now() where c.business_id = v_id and c.status = 'pending';
  update public.businesses b set status = 'deleted', deleted_at = now() where b.id = v_id;
  perform public.write_audit(v_id, 'deletion_requested', 'business', v_id::text, '{}');
  perform public.notify_admin('deletion_requested', v_id, '{}');
end $$;

create or replace function public.seller_catalog_stats(p_stale_days integer default 90) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_days integer := greatest(1, least(coalesce(p_stale_days, 90), 3650));
  v_b public.businesses;
  v_limit integer;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into v_b from public.businesses where id = v_id;
  select p.items_limit into v_limit from public.plans p where p.category_id = v_b.category_id and p.plan_key = v_b.plan_key;
  return (
    select jsonb_build_object(
      'total', count(*),
      'visible', count(*) filter (where i.visible and not i.hidden_by_admin),
      'hidden', count(*) filter (where not i.visible),
      'hidden_by_admin', count(*) filter (where i.hidden_by_admin),
      'out_of_stock', count(*) filter (where i.availability = 'out_of_stock'),
      'limited_stock', count(*) filter (where i.availability = 'limited_stock'),
      'unavailable', count(*) filter (where i.availability = 'unavailable'),
      'without_photo', count(*) filter (where not exists (select 1 from public.item_media m where m.item_id = i.id and m.kind = 'image')),
      'stale_prices', count(*) filter (where i.price_confirmed_at < now() - make_interval(days => v_days)),
      'items_limit', v_limit,
      'open_flags', (select count(*) from public.flags f where f.business_id = v_id and f.status = 'open'),
      'unread_messages', (select count(*) from public.messages m where m.business_id = v_id and m.read_at is null)
    ) from public.items i where i.business_id = v_id
  );
end $$;

create or replace function public.seller_item_signals() returns table (item_id uuid, open_flags integer, reports_30d integer)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_id uuid := public.my_business_id();
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  return query
    select i.id, coalesce(f.c, 0)::integer, coalesce(r.c, 0)::integer
    from public.items i
    left join (select fl.item_id as iid, count(*) as c from public.flags fl where fl.business_id = v_id and fl.status = 'open' and fl.item_id is not null group by fl.item_id) f on f.iid = i.id
    left join (select rp.item_id as iid, count(*) as c from public.reports rp where rp.business_id = v_id and rp.created_at > now() - interval '30 days' and rp.item_id is not null group by rp.item_id) r on r.iid = i.id
    where i.business_id = v_id and (f.c is not null or r.c is not null);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'seller_update_profile(jsonb)', 'seller_request_change(text, text)', 'seller_cancel_change(uuid)',
    'seller_confirm_prices()', 'seller_reply_flag(uuid, text)', 'seller_mark_read(uuid[])',
    'seller_pause_listing(boolean)', 'seller_request_deletion(text)', 'seller_catalog_stats(integer)',
    'seller_item_signals()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end $$;

create or replace function public.auth_lock_remaining(p_key text) returns integer
language sql stable security definer set search_path = public as
$$ select coalesce((select greatest(0, ceil(extract(epoch from (a.locked_until - now())))::integer) from public.auth_attempts a where a.key = p_key and a.locked_until > now()), 0) $$;

create or replace function public.auth_record_failure(p_key text, p_max integer default 5, p_lock_seconds integer default 900) returns integer
language plpgsql security definer set search_path = public as $$
declare r public.auth_attempts;
begin
  insert into public.auth_attempts as a (key, failures, locked_until, last_failure_at)
  values (p_key, 1, null, now())
  on conflict (key) do update set
    failures = case when a.locked_until is not null and a.locked_until <= now() then 1 else a.failures + 1 end,
    locked_until = case when a.locked_until is not null and a.locked_until <= now() then null else a.locked_until end,
    last_failure_at = now()
  returning * into r;
  if r.failures >= p_max and r.locked_until is null then
    update public.auth_attempts a set locked_until = now() + make_interval(secs => p_lock_seconds) where a.key = p_key;
  end if;
  return public.auth_lock_remaining(p_key);
end $$;

create or replace function public.auth_clear(p_key text) returns void
language sql security definer set search_path = public as
$$ delete from public.auth_attempts where key = p_key $$;

create or replace function public.seller_otp_issue(p_business uuid, p_purpose text, p_code text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_last timestamptz;
  v_hour integer;
  v_id uuid := gen_random_uuid();
begin
  if p_purpose not in ('forgot_password','change_password') or p_code !~ '^[0-9]{6}$' then raise exception 'invalid_otp_request'; end if;
  perform pg_advisory_xact_lock(hashtext(p_business::text || 'otp:' || p_purpose));
  select max(o.created_at), count(*) filter (where o.created_at > now() - interval '1 hour')
    into v_last, v_hour from public.seller_otps o where o.business_id = p_business and o.purpose = p_purpose;
  if v_last is not null and v_last > now() - interval '60 seconds' then
    return jsonb_build_object('ok', false, 'reason', 'resend_wait', 'retry_after', ceil(extract(epoch from (v_last + interval '60 seconds' - now())))::integer);
  end if;
  if v_hour >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'hour_limit', 'retry_after', 3600);
  end if;
  update public.seller_otps o set used = true where o.business_id = p_business and o.purpose = p_purpose and not o.used;
  insert into public.seller_otps (id, business_id, purpose, code_hash, expires_at)
  values (v_id, p_business, p_purpose, encode(digest(v_id::text || ':' || p_code, 'sha256'), 'hex'), now() + interval '10 minutes');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.seller_otp_verify(p_business uuid, p_purpose text, p_code text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r public.seller_otps;
begin
  select * into r from public.seller_otps o
  where o.business_id = p_business and o.purpose = p_purpose and not o.used and o.expires_at > now()
  order by o.created_at desc limit 1 for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if r.attempts >= 5 then return jsonb_build_object('ok', false, 'reason', 'attempts'); end if;
  update public.seller_otps o set attempts = o.attempts + 1 where o.id = r.id;
  if r.code_hash = encode(digest(r.id::text || ':' || coalesce(p_code, ''), 'sha256'), 'hex') then
    update public.seller_otps o set used = true where o.id = r.id;
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'reason', 'invalid');
end $$;

create or replace function public.revoke_user_sessions(p_user uuid, p_keep uuid default null) returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  delete from auth.sessions s where s.user_id = p_user and (p_keep is null or s.id <> p_keep);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'auth_lock_remaining(text)', 'auth_record_failure(text, integer, integer)', 'auth_clear(text)',
    'seller_otp_issue(uuid, text, text)', 'seller_otp_verify(uuid, text, text)', 'revoke_user_sessions(uuid, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('seller-media', 'seller-media', true, 26214400, array['image/webp','image/jpeg','image/png','video/mp4','video/webm'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "seller reads own media files" on storage.objects;
create policy "seller reads own media files" on storage.objects for select to authenticated
  using (bucket_id = 'seller-media' and (storage.foldername(name))[1] = public.my_business_id()::text);
drop policy if exists "seller uploads own media files" on storage.objects;
create policy "seller uploads own media files" on storage.objects for insert to authenticated
  with check (bucket_id = 'seller-media' and (storage.foldername(name))[1] = public.my_business_id()::text);
drop policy if exists "seller updates own media files" on storage.objects;
create policy "seller updates own media files" on storage.objects for update to authenticated
  using (bucket_id = 'seller-media' and (storage.foldername(name))[1] = public.my_business_id()::text)
  with check (bucket_id = 'seller-media' and (storage.foldername(name))[1] = public.my_business_id()::text);
drop policy if exists "seller deletes own media files" on storage.objects;
create policy "seller deletes own media files" on storage.objects for delete to authenticated
  using (bucket_id = 'seller-media' and (storage.foldername(name))[1] = public.my_business_id()::text);
drop policy if exists "admin manages seller media files" on storage.objects;
create policy "admin manages seller media files" on storage.objects for all to authenticated
  using (bucket_id = 'seller-media' and public.is_admin()) with check (bucket_id = 'seller-media' and public.is_admin());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'change_requests') then
    alter publication supabase_realtime add table public.change_requests;
  end if;
end $$;
