-- My Account (seller portal): branches, map-pin and licence-document change requests,
-- server-side category change quote, tighter profile limits. Safe to re-run.

-- 1. Business columns -------------------------------------------------------------
alter table public.businesses add column if not exists licence_docs jsonb not null default '[]'
  check (jsonb_typeof(licence_docs) = 'array');

-- 2. Change requests: two more locked fields and the quote a dearer category must pay ----
alter table public.change_requests add column if not exists quote_kes integer check (quote_kes >= 0);
alter table public.change_requests drop constraint if exists change_requests_field_check;
alter table public.change_requests add constraint change_requests_field_check
  check (field in ('name','category_id','phone','town','pin','licence','location','licence_docs'));

-- Mirrors categoryChangeQuote in @epicmkt/shared: prorated difference for the days left in the paid
-- month, rounded up. A cheaper (or equal) category costs nothing now and applies at renewal.
create or replace function public.category_change_quote(p_old integer, p_new integer, p_paid_until timestamptz)
returns integer language plpgsql stable set search_path = public as $$
declare
  v_end date;
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_days integer;
  v_left integer;
begin
  if p_paid_until is null or p_new <= p_old then return 0; end if;
  v_end := (p_paid_until at time zone 'Africa/Nairobi')::date;
  v_days := v_end - (v_end - interval '1 month')::date;
  v_left := least(v_days, greatest(0, v_end - v_today));
  return ceil(((p_new - p_old)::numeric * v_left) / v_days)::integer;
end $$;
grant execute on function public.category_change_quote(integer, integer, timestamptz) to authenticated, service_role;

create or replace function public.seller_request_change(p_field text, p_value text) returns public.change_requests
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_b public.businesses;
  v_new text := btrim(coalesce(p_value, ''));
  v_old text;
  v_quote integer;
  v_old_price integer;
  v_new_price integer;
  v_lat double precision;
  v_lng double precision;
  v_docs jsonb;
  m text[];
  e jsonb;
  r public.change_requests;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_field is null or p_field not in ('name','category_id','phone','town','pin','licence','location','licence_docs') then
    raise exception 'field_not_allowed:%', coalesce(p_field, '') using errcode = '42501';
  end if;
  select * into v_b from public.businesses where id = v_id;
  if p_field = 'name' and char_length(v_new) not between 2 and 100 then raise exception 'invalid_name'; end if;
  if p_field = 'category_id' then
    if not exists (select 1 from public.categories c where c.id = v_new and c.active) then raise exception 'invalid_category'; end if;
    select price_kes into v_old_price from public.plans where category_id = v_b.category_id and plan_key = v_b.plan_key;
    select price_kes into v_new_price from public.plans where category_id = v_new and plan_key = v_b.plan_key;
    if v_new_price is null then raise exception 'invalid_category'; end if;
    v_quote := public.category_change_quote(coalesce(v_old_price, v_new_price), v_new_price, v_b.paid_until);
  end if;
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
  if p_field = 'location' then
    m := regexp_match(v_new, '^(-?[0-9]{1,2}(?:\.[0-9]+)?)\s*,\s*(-?[0-9]{1,3}(?:\.[0-9]+)?)$');
    if m is null then raise exception 'invalid_location'; end if;
    v_lat := m[1]::double precision;
    v_lng := m[2]::double precision;
    if v_lat not between -5 and 5.5 or v_lng not between 33.5 and 42.5 then raise exception 'invalid_location'; end if;
    v_new := round(v_lat::numeric, 6)::text || ',' || round(v_lng::numeric, 6)::text;
  end if;
  if p_field = 'licence_docs' then
    begin
      v_docs := v_new::jsonb;
    exception when others then
      raise exception 'invalid_licence_docs';
    end;
    if jsonb_typeof(v_docs) <> 'array' or jsonb_array_length(v_docs) not between 1 and 5 then raise exception 'invalid_licence_docs'; end if;
    for e in select value from jsonb_array_elements(v_docs) loop
      if jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') > 300
         or (e #>> '{}') not like v_id::text || '/%' or (e #>> '{}') like '%..%' then
        raise exception 'invalid_licence_docs';
      end if;
    end loop;
    v_new := v_docs::text;
  end if;

  if p_field = 'location' then
    v_old := case when v_b.lat is null or v_b.lng is null then null
                  else round(v_b.lat::numeric, 6)::text || ',' || round(v_b.lng::numeric, 6)::text end;
  else
    v_old := to_jsonb(v_b) ->> p_field;
  end if;
  if v_old is not distinct from v_new then raise exception 'no_change'; end if;
  begin
    insert into public.change_requests (business_id, field, old_value, new_value, quote_kes)
    values (v_id, p_field, v_old, v_new, v_quote) returning * into r;
  exception when unique_violation then
    raise exception 'change_already_pending';
  end;
  perform public.write_audit(v_id, 'change_requested', 'change_request', r.id::text, jsonb_build_object('field', p_field));
  perform public.notify_admin('change_request', v_id, jsonb_build_object('change_id', r.id, 'field', p_field, 'quote_kes', v_quote));
  return r;
end $$;

-- 3. Profile updates: tighter limits and the new profile keys ---------------------------
create or replace function public.seller_update_profile(p_patch jsonb) returns public.businesses
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_b public.businesses;
  k text;
  e jsonb;
  pr jsonb;
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
  if p_patch ? 'tagline' and char_length(coalesce(p_patch ->> 'tagline', '')) > 80 then raise exception 'invalid_tagline'; end if;
  if p_patch ? 'description' and char_length(coalesce(p_patch ->> 'description', '')) > 1500 then raise exception 'invalid_description'; end if;
  if p_patch ? 'delivery_area' and char_length(coalesce(p_patch ->> 'delivery_area', '')) > 200 then raise exception 'invalid_delivery_area'; end if;
  if p_patch ? 'address' and char_length(coalesce(p_patch ->> 'address', '')) > 200 then raise exception 'invalid_address'; end if;
  if p_patch ? 'whatsapp' and p_patch ->> 'whatsapp' is not null and public.normalize_phone_ke(p_patch ->> 'whatsapp') is null then raise exception 'invalid_whatsapp'; end if;
  if p_patch ? 'email' and p_patch ->> 'email' is not null and (char_length(p_patch ->> 'email') > 120 or p_patch ->> 'email' !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'invalid_email'; end if;
  foreach k in array array['logo_path','cover_path'] loop
    if p_patch ? k and p_patch ->> k is not null and (char_length(p_patch ->> k) > 300 or p_patch ->> k not like v_id::text || '/%' or p_patch ->> k like '%..%') then raise exception 'invalid_%', k; end if;
  end loop;
  if p_patch ? 'announcement' and p_patch ->> 'announcement' is not null then
    if v_b.plan_key <> 'premium' then raise exception 'premium_only' using errcode = '42501'; end if;
    if char_length(p_patch ->> 'announcement') > 140 then raise exception 'invalid_announcement'; end if;
    -- short text only: no links, no email addresses, no phone numbers
    if p_patch ->> 'announcement' ~* '(https?:|www\.|@|\.(com|co\.ke|ke|org|net|info|biz)\M)'
       or p_patch ->> 'announcement' ~ '[0-9][0-9 ().\-]{5,}[0-9]' then
      raise exception 'invalid_announcement';
    end if;
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
  if p_patch ? 'profile' then
    pr := p_patch -> 'profile';
    if jsonb_typeof(pr) <> 'object' or octet_length(pr::text) > 10000 then raise exception 'invalid_profile'; end if;
    if pr ? 'year_established' and jsonb_typeof(pr -> 'year_established') <> 'null'
       and (jsonb_typeof(pr -> 'year_established') <> 'number'
            or (pr ->> 'year_established')::numeric <> trunc((pr ->> 'year_established')::numeric)
            or (pr ->> 'year_established')::numeric not between 1900 and extract(year from now())::numeric) then
      raise exception 'invalid_year_established';
    end if;
    if pr ? 'website' and jsonb_typeof(pr -> 'website') <> 'null'
       and (jsonb_typeof(pr -> 'website') <> 'string' or char_length(pr ->> 'website') > 200 or pr ->> 'website' !~* '^https?://[^\s]+\.[^\s]+$') then
      raise exception 'invalid_website';
    end if;
    if pr ? 'shopfront_path' and jsonb_typeof(pr -> 'shopfront_path') <> 'null'
       and (jsonb_typeof(pr -> 'shopfront_path') <> 'string' or char_length(pr ->> 'shopfront_path') > 300
            or pr ->> 'shopfront_path' not like v_id::text || '/%' or pr ->> 'shopfront_path' like '%..%') then
      raise exception 'invalid_shopfront_path';
    end if;
    if pr ? 'languages' and jsonb_typeof(pr -> 'languages') <> 'null' then
      if jsonb_typeof(pr -> 'languages') <> 'array' or jsonb_array_length(pr -> 'languages') > 10 then raise exception 'invalid_languages'; end if;
      for e in select value from jsonb_array_elements(pr -> 'languages') loop
        if jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') > 30 then raise exception 'invalid_languages'; end if;
      end loop;
    end if;
    if pr ? 'attributes' and jsonb_typeof(pr -> 'attributes') not in ('object','null') then raise exception 'invalid_attributes'; end if;
    if pr ? 'section_updated' and jsonb_typeof(pr -> 'section_updated') not in ('object','null') then raise exception 'invalid_profile'; end if;
  end if;

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

-- 4. Branches (Premium only, at most 5 per business) -----------------------------------
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  address text check (char_length(address) <= 200),
  town text check (char_length(town) <= 60),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  phone text,
  hours jsonb not null default '{}' check (jsonb_typeof(hours) = 'object' and octet_length(hours::text) <= 2000),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists branches_business_idx on public.branches (business_id, sort);

drop trigger if exists t_branches_touch on public.branches;
create trigger t_branches_touch before update on public.branches for each row execute function public.touch_updated_at();

create or replace function public.enforce_branch_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
  v_count integer;
begin
  if new.phone is not null and btrim(new.phone) <> '' then
    new.phone := public.normalize_phone_ke(new.phone);
    if new.phone is null then raise exception 'invalid_phone'; end if;
  else
    new.phone := null;
  end if;
  if tg_op = 'UPDATE' then
    if new.business_id <> old.business_id then raise exception 'branch_business_locked' using errcode = '42501'; end if;
    return new;
  end if;
  if auth.uid() is null then return new; end if; -- service role / system
  perform pg_advisory_xact_lock(hashtext(new.business_id::text || 'branches'));
  select b.plan_key into v_plan from public.businesses b where b.id = new.business_id;
  if v_plan is distinct from 'premium' then raise exception 'premium_only' using errcode = '42501'; end if;
  select count(*) into v_count from public.branches x where x.business_id = new.business_id;
  if v_count >= 5 then raise exception 'limit_reached:branches' using errcode = 'P0001'; end if;
  return new;
end $$;

drop trigger if exists t_branches_rules on public.branches;
create trigger t_branches_rules before insert or update on public.branches for each row execute function public.enforce_branch_rules();

alter table public.branches enable row level security;
drop policy if exists "seller manages own branches" on public.branches;
create policy "seller manages own branches" on public.branches for all to authenticated
  using (business_id = public.my_business_id()) with check (business_id = public.my_business_id());
drop policy if exists "admin all branches" on public.branches;
create policy "admin all branches" on public.branches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.branches from public, anon;
grant select, insert, update, delete on public.branches to authenticated;
grant all on public.branches to service_role;

-- 5. Private bucket for licence documents ---------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('seller-docs', 'seller-docs', false, 10485760, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "seller reads own docs" on storage.objects;
create policy "seller reads own docs" on storage.objects for select to authenticated
  using (bucket_id = 'seller-docs' and (storage.foldername(name))[1] = public.my_business_id()::text);
drop policy if exists "seller uploads own docs" on storage.objects;
create policy "seller uploads own docs" on storage.objects for insert to authenticated
  with check (bucket_id = 'seller-docs' and (storage.foldername(name))[1] = public.my_business_id()::text);
drop policy if exists "seller deletes own docs" on storage.objects;
create policy "seller deletes own docs" on storage.objects for delete to authenticated
  using (bucket_id = 'seller-docs' and (storage.foldername(name))[1] = public.my_business_id()::text);
drop policy if exists "admin manages seller docs" on storage.objects;
create policy "admin manages seller docs" on storage.objects for all to authenticated
  using (bucket_id = 'seller-docs' and public.is_admin()) with check (bucket_id = 'seller-docs' and public.is_admin());
