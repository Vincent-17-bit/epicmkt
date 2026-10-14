-- Parked from 0008_admin.sql. Not run by migrations: each block assumes the admin design of items, item_media, faqs,
-- offers, flags, reports and change_requests, which differs from the seller schema in 0004-0007. Needs a decision.

-- content tables: items, item_media, faqs, offers, flags, reports
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  item_type text not null default 'product' check (item_type in ('product','service','package','class')),
  section text,
  short_description text,
  description text,
  price_type text not null default 'fixed' check (price_type in ('fixed','from','range','free','contact')),
  price integer,
  price_max integer,
  unit text,
  sale_price integer,
  sale_starts date,
  sale_ends date,
  availability text not null default 'available'
    check (availability in ('available','limited_stock','out_of_stock','seasonal','by_appointment','coming_soon')),
  stock_count integer check (stock_count is null or stock_count >= 0),
  badge text check (badge in ('Popular','New','Best value')),
  tags text[] not null default '{}',
  variants jsonb not null default '[]',
  specs jsonb not null default '{}',
  extra jsonb not null default '{}',
  sort int not null default 0,
  visible boolean not null default true,
  hidden_by_admin boolean not null default false,
  admin_hide_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists items_name_trgm on public.items using gin (name gin_trgm_ops);
create index if not exists items_business_idx on public.items (business_id, sort);
create index if not exists items_tags_idx on public.items using gin (tags);
drop trigger if exists t_items_touch on public.items;
create trigger t_items_touch before update on public.items for each row execute function public.touch_updated_at();

create table if not exists public.item_media (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  kind text not null check (kind in ('image','video')),
  storage_path text not null,
  poster_path text,
  alt text,
  sort int not null default 0,
  status text not null default 'ready' check (status in ('processing','ready','failed')),
  removed_by_admin boolean not null default false,
  admin_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  question text not null check (char_length(question) <= 120),
  answer text not null check (char_length(answer) <= 500),
  sort int not null default 0,
  visible boolean not null default true,
  admin_status text not null default 'ok' check (admin_status in ('ok','hidden','removed')),
  admin_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists faqs_business_idx on public.faqs (business_id, sort);
drop trigger if exists t_faqs_touch on public.faqs;
create trigger t_faqs_touch before update on public.faqs for each row execute function public.touch_updated_at();

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null,
  description text,
  discount_type text not null check (discount_type in ('percent','amount')),
  discount_value integer not null check (discount_value > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  item_ids uuid[] not null default '{}',
  admin_status text not null default 'ok' check (admin_status in ('ok','hidden','removed')),
  admin_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.flags (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('business','item','faq','media','offer','application')),
  target_id uuid not null,
  business_id uuid references public.businesses(id) on delete cascade,
  reason text not null,
  severity text not null default 'medium' check (severity in ('low','medium','high')),
  status text not null default 'open' check (status in ('open','investigating','resolved','dismissed')),
  note text,
  seller_message text,
  seller_due_at timestamptz,
  seller_reply text,
  seller_replied_at timestamptz,
  assigned_to uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists flags_open_idx on public.flags (status, created_at desc);
create index if not exists flags_business_idx on public.flags (business_id, status);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  report_type text not null check (report_type in ('wrong_price','closed_but_listed_open','fake','offensive','other')),
  details text check (char_length(details) <= 500),
  reporter_hash text,
  status text not null default 'open' check (status in ('open','investigating','resolved','dismissed')),
  assigned_to uuid references auth.users(id),
  admin_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists reports_open_idx on public.reports (status, created_at desc);

-- change_requests
create table if not exists public.change_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  field_path text not null,
  old_value jsonb,
  new_value jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reason text,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- public read policies on items, item_media, faqs, offers
drop policy if exists "public read visible items" on public.items;
create policy "public read visible items" on public.items for select to anon, authenticated using (
  visible and not hidden_by_admin and exists (
    select 1 from public.businesses b where b.id = business_id and public.business_is_visible(b)
  )
);
drop policy if exists "public read visible media" on public.item_media;
create policy "public read visible media" on public.item_media for select to anon, authenticated using (
  status = 'ready' and not removed_by_admin and exists (
    select 1 from public.items i join public.businesses b on b.id = i.business_id
    where i.id = item_id and i.visible and not i.hidden_by_admin and public.business_is_visible(b)
  )
);
drop policy if exists "public read visible faqs" on public.faqs;
create policy "public read visible faqs" on public.faqs for select to anon, authenticated using (
  visible and admin_status = 'ok' and exists (
    select 1 from public.businesses b where b.id = business_id and public.business_is_visible(b)
  )
);
drop policy if exists "public read offers" on public.offers;
create policy "public read offers" on public.offers for select to anon, authenticated using (
  admin_status = 'ok' and exists (
    select 1 from public.businesses b where b.id = business_id and public.business_is_visible(b)
  )
);

-- seller policies duplicating the seller schema
drop policy if exists "seller read own business" on public.businesses;
create policy "seller read own business" on public.businesses for select to authenticated using (owner_user_id = auth.uid());
drop policy if exists "seller manage own items" on public.items;
create policy "seller manage own items" on public.items for all to authenticated
  using (public.owns_business(business_id)) with check (public.owns_business(business_id));
drop policy if exists "seller manage own media" on public.item_media;
create policy "seller manage own media" on public.item_media for all to authenticated
  using (exists (select 1 from public.items i where i.id = item_id and public.owns_business(i.business_id)))
  with check (exists (select 1 from public.items i where i.id = item_id and public.owns_business(i.business_id)));
drop policy if exists "seller manage own faqs" on public.faqs;
create policy "seller manage own faqs" on public.faqs for all to authenticated
  using (public.owns_business(business_id)) with check (public.owns_business(business_id));
drop policy if exists "seller manage own offers" on public.offers;
create policy "seller manage own offers" on public.offers for all to authenticated
  using (public.owns_business(business_id)) with check (public.owns_business(business_id));
drop policy if exists "seller read own flags" on public.flags;
create policy "seller read own flags" on public.flags for select to authenticated using (public.owns_business(business_id));
drop policy if exists "seller read own payments" on public.payments;
create policy "seller read own payments" on public.payments for select to authenticated using (public.owns_business(business_id));
drop policy if exists "seller read own messages" on public.messages;
create policy "seller read own messages" on public.messages for select to authenticated
  using (channel = 'in_app' and public.owns_business(business_id));
drop policy if exists "seller read own change requests" on public.change_requests;
create policy "seller read own change requests" on public.change_requests for select to authenticated using (public.owns_business(business_id));

-- protect_admin_cols and its triggers
create or replace function public.protect_admin_cols() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_table_name = 'items' then
      new.hidden_by_admin := old.hidden_by_admin; new.admin_hide_reason := old.admin_hide_reason;
    elsif tg_table_name = 'faqs' or tg_table_name = 'offers' then
      new.admin_status := old.admin_status; new.admin_reason := old.admin_reason;
    elsif tg_table_name = 'item_media' then
      new.removed_by_admin := old.removed_by_admin; new.admin_reason := old.admin_reason;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists t_items_protect on public.items;
drop trigger if exists t_faqs_protect on public.faqs;
drop trigger if exists t_offers_protect on public.offers;
drop trigger if exists t_media_protect on public.item_media;
create trigger t_items_protect before update on public.items for each row execute function public.protect_admin_cols();
create trigger t_faqs_protect before update on public.faqs for each row execute function public.protect_admin_cols();
create trigger t_offers_protect before update on public.offers for each row execute function public.protect_admin_cols();
create trigger t_media_protect before update on public.item_media for each row execute function public.protect_admin_cols();

-- admin_search
create or replace function public.admin_search(q text, scopes text[] default null, lim int default 8) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  term text := btrim(coalesce(q, ''));
  pat text;
  res jsonb := '{}'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(term) < 2 then return res; end if;
  pat := '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  lim := least(greatest(coalesce(lim, 8), 1), 25);

  if scopes is null or 'businesses' = any(scopes) then
    res := res || jsonb_build_object('businesses', coalesce((select jsonb_agg(r) from (
      select b.id, b.name, b.slug, b.seller_id, b.status, b.plan_key, b.town, b.phone, b.paid_until,
             b.verification_level, b.featured,
             (select count(*) from flags f where f.business_id = b.id and f.status in ('open','investigating')) as open_flags
        from businesses b
       where b.deleted_at is null
         and (b.name ilike pat or b.slug ilike pat or b.seller_id ilike pat or b.phone ilike pat
              or b.email ilike pat or b.owner_name ilike pat or b.town ilike pat)
       order by similarity(b.name, term) desc, b.name
       limit lim) r), '[]'::jsonb));
  end if;

  if scopes is null or 'items' = any(scopes) then
    res := res || jsonb_build_object('items', coalesce((select jsonb_agg(r) from (
      select i.id, i.name, i.price, i.price_type, i.unit, i.availability, i.visible, i.hidden_by_admin,
             i.business_id, b.name as business_name, b.slug as business_slug,
             (select count(*) from reports rp where rp.item_id = i.id and rp.status in ('open','investigating')) as open_reports,
             (select count(*) from flags f where f.target_type = 'item' and f.target_id = i.id and f.status in ('open','investigating')) as open_flags
        from items i join businesses b on b.id = i.business_id
       where i.name ilike pat or i.short_description ilike pat or b.name ilike pat
          or exists (select 1 from unnest(i.tags) t where t ilike pat)
       order by similarity(i.name, term) desc, i.name
       limit lim) r), '[]'::jsonb));
  end if;

  if scopes is null or 'applications' = any(scopes) then
    res := res || jsonb_build_object('applications', coalesce((select jsonb_agg(r) from (
      select a.id, a.reference_no, a.business_name, a.owner_full_name, a.phone, a.status, a.submitted_at
        from applications a
       where a.status <> 'uploading'
         and (a.reference_no ilike pat or a.business_name ilike pat or a.owner_full_name ilike pat
              or a.phone ilike pat or a.email ilike pat or a.payment_code ilike pat)
       order by a.submitted_at desc nulls last
       limit lim) r), '[]'::jsonb));
  end if;

  if scopes is null or 'payments' = any(scopes) then
    res := res || jsonb_build_object('payments', coalesce((select jsonb_agg(r) from (
      select p.id, p.mpesa_code, p.amount, p.status, p.phone, p.business_id, b.name as business_name, p.submitted_at
        from payments p left join businesses b on b.id = p.business_id
       where p.mpesa_code ilike pat or p.phone ilike pat or p.receipt_no ilike pat
       order by p.submitted_at desc
       limit lim) r), '[]'::jsonb));
  end if;

  if scopes is null or 'faqs' = any(scopes) then
    res := res || jsonb_build_object('faqs', coalesce((select jsonb_agg(r) from (
      select f.id, f.question, f.admin_status, f.business_id, b.name as business_name
        from faqs f join businesses b on b.id = f.business_id
       where f.question ilike pat or f.answer ilike pat
       order by f.created_at desc
       limit lim) r), '[]'::jsonb));
  end if;

  return res;
end $$;
revoke all on function public.admin_search(text, text[], int) from public, anon;
grant execute on function public.admin_search(text, text[], int) to authenticated;

-- admin_set_flag_status
create or replace function public.admin_set_flag_status(p_id uuid, p_status text, p_note text default null) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.flags
     set status = p_status,
         note = coalesce(p_note, note),
         resolved_at = case when p_status in ('resolved','dismissed') then now() else null end
   where id = p_id;
  perform public.write_audit('flag.status', 'flag', p_id, null, jsonb_build_object('status', p_status, 'note', p_note), p_note);
  return true;
end $$;
