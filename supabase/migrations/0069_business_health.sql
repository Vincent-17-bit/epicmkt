-- 0069_business_health.sql
-- One business health score, defined once, in SQL.
--
-- What the score is for: CHURN RISK. "How likely is this business to stop paying?" It is built from four parts, each 0 to 100:
--   profile    the same 8 checks as before (tagline, description, logo, cover, address, WhatsApp, hours, at least one item)
--   freshness  the share of items whose price was confirmed in the last N days (N can differ per category). No items = 0
--   activity   how recently the business did ANYTHING: the latest of login, business edit, item edit, price confirmation
--   trust      100 minus capped penalties for open flags, open reports and strikes
--
-- What this replaces. The formula used to live in three places (the admin_businesses_v view, a hand-built ORDER BY string in
-- admin_businesses_query, and admin/src/lib/health.js), so changing a weight in one made the sort disagree with the number shown.
-- It also had three bugs: an empty catalogue scored 100 for price freshness (coalesce(price_age_days, 0)), a business that had
-- never logged in counted as 30 days idle (so every new business looked unhealthy), and the stalest single item decided the whole
-- freshness part. Now:
--   * business_health(...)        the only place the formula exists. Returns score, band, the four parts, weights and reasons.
--   * business_health_inputs_v    the raw numbers per business, one grouped pass (no subquery per row).
--   * business_health_v           inputs + business_health(...). admin_businesses_v, the sort and the UI all read this.
--   * site_settings 'health_config'   every weight and threshold. Tune it from Settings, no deploy needed.
--   * business_health_snapshots   one row per business per day, written by the daily job: history, trend, and the data to
--                                 calibrate the weights against real non-renewals later.
--
-- Rules worth knowing:
--   * New-business grace (grace_days, default 14): while a business is that young, an unmeasurable freshness (no items) or
--     activity (never active) part is NEUTRAL (default 70) instead of 0. Once the grace is over they count as 0.
--   * Hard caps: a suspended or expired business, one with a serious open flag (still unanswered after serious_flag_days),
--     or one that has reached the strike threshold can never score above "At risk", whatever its other parts say.
--   * Bands: Healthy (70+), Watch (40 to 69), At risk (below 40).
-- Additive; safe to run again.

-- ---------------------------------------------------------------------------
-- 1. Configuration. Read defensively: a bad value typed into site_settings falls back to its default instead of breaking the list.
-- ---------------------------------------------------------------------------
create or replace function public.health_num(p jsonb, p_path text[], p_default numeric, p_min numeric, p_max numeric)
returns numeric language plpgsql immutable as $$
declare
  v numeric;
begin
  v := (p #>> p_path)::numeric;
  if v is null or v = 'NaN'::numeric then return p_default; end if;
  return least(p_max, greatest(p_min, v));
exception when others then
  return p_default;
end $$;

-- Fills in every missing key, clamps every number into its allowed range and drops anything it does not know.
create or replace function public.health_normalize(s jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  v_s jsonb := case when jsonb_typeof(s) = 'object' then s else '{}'::jsonb end;
  v_map jsonb := '{}'::jsonb;
  v_healthy numeric := public.health_num(v_s, '{bands,healthy}', 70, 2, 100);
  v_watch numeric;
  v_full numeric := public.health_num(v_s, '{activity_full_days}', 3, 0, 90);
  v_zero numeric;
begin
  v_watch := least(public.health_num(v_s, '{bands,watch}', 40, 1, 99), v_healthy - 1);
  v_zero := greatest(public.health_num(v_s, '{activity_zero_days}', 30, 1, 365), v_full + 1);
  if jsonb_typeof(v_s -> 'freshness_days_by_category') = 'object' then
    select coalesce(jsonb_object_agg(e.k, e.v::integer), '{}'::jsonb) into v_map
      from jsonb_each_text(v_s -> 'freshness_days_by_category') as e(k, v)
     where case when e.v ~ '^[0-9]{1,3}$' then e.v::integer between 1 and 365 else false end;
  end if;
  return jsonb_build_object(
    'weights', jsonb_build_object(
      'profile',   public.health_num(v_s, '{weights,profile}',   20, 0, 100)::integer,
      'freshness', public.health_num(v_s, '{weights,freshness}', 25, 0, 100)::integer,
      'activity',  public.health_num(v_s, '{weights,activity}',  35, 0, 100)::integer,
      'trust',     public.health_num(v_s, '{weights,trust}',     20, 0, 100)::integer),
    'grace_days', public.health_num(v_s, '{grace_days}', 14, 0, 90)::integer,
    'neutral', public.health_num(v_s, '{neutral}', 70, 0, 100)::integer,
    'freshness_days', public.health_num(v_s, '{freshness_days}', 14, 1, 365)::integer,
    'freshness_days_by_category', v_map,
    'activity_full_days', v_full::integer,
    'activity_zero_days', v_zero::integer,
    'trust', jsonb_build_object(
      'flag',       public.health_num(v_s, '{trust,flag}',       25, 0, 100)::integer,
      'flag_cap',   public.health_num(v_s, '{trust,flag_cap}',   50, 0, 100)::integer,
      'report',     public.health_num(v_s, '{trust,report}',     15, 0, 100)::integer,
      'report_cap', public.health_num(v_s, '{trust,report_cap}', 30, 0, 100)::integer,
      'strike',     public.health_num(v_s, '{trust,strike}',     20, 0, 100)::integer,
      'strike_cap', public.health_num(v_s, '{trust,strike_cap}', 60, 0, 100)::integer),
    'serious_flag_days', public.health_num(v_s, '{serious_flag_days}', 7, 0, 90)::integer,
    'bands', jsonb_build_object('healthy', v_healthy::integer, 'watch', v_watch::integer));
end $$;

-- The live configuration, plus the strike threshold the admin already sets on the Settings page (one setting, not two).
create or replace function public.health_config() returns jsonb
language plpgsql stable set search_path = public as $$
declare
  v_s jsonb;
  v_strike integer;
begin
  select value into v_s from public.site_settings where key = 'health_config';
  begin
    select (value #>> '{}')::integer into v_strike from public.site_settings where key = 'strike_threshold';
  exception when others then
    v_strike := null;
  end;
  return public.health_normalize(coalesce(v_s, '{}'::jsonb))
      || jsonb_build_object('strike_threshold', greatest(1, coalesce(v_strike, 3)));
end $$;

-- Seed the defaults once. bakery and tailor are examples of a per-category window (days); an id that does not exist is ignored.
insert into public.site_settings (key, value)
values ('health_config', public.health_normalize('{"freshness_days_by_category": {"bakery": 3, "tailor": 60}}'::jsonb))
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. The formula. The only place it exists. Pure: everything it needs comes in as arguments.
-- ---------------------------------------------------------------------------
create or replace function public.business_health(
  p_state text,                  -- deleted, pending, live, expiring, grace, expired, paused, suspended
  p_age_days integer,            -- days since the business was created
  p_missing text[],              -- the profile checks that failed, by label
  p_items integer,               -- items (not removed by an admin)
  p_fresh_items integer,         -- of those, price confirmed within p_fresh_days
  p_fresh_days integer,          -- the freshness window that applies to this business's category
  p_activity_age integer,        -- days since the latest login, edit or price confirmation; null = never
  p_open_flags integer,
  p_serious_flags integer,       -- open flags still unanswered after serious_flag_days
  p_open_reports integer,
  p_strikes integer,
  p_cfg jsonb                    -- health_config()
) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  w_p numeric := (p_cfg #>> '{weights,profile}')::numeric;
  w_f numeric := (p_cfg #>> '{weights,freshness}')::numeric;
  w_a numeric := (p_cfg #>> '{weights,activity}')::numeric;
  w_t numeric := (p_cfg #>> '{weights,trust}')::numeric;
  v_wsum numeric;
  v_neutral numeric := (p_cfg ->> 'neutral')::numeric;
  v_grace boolean := coalesce(p_age_days, 0) < (p_cfg ->> 'grace_days')::integer;
  v_full integer := (p_cfg ->> 'activity_full_days')::integer;
  v_zero integer := (p_cfg ->> 'activity_zero_days')::integer;
  v_healthy integer := (p_cfg #>> '{bands,healthy}')::integer;
  v_watch integer := (p_cfg #>> '{bands,watch}')::integer;
  v_checks integer := 8 - coalesce(cardinality(p_missing), 0);
  s_p numeric;
  s_f numeric;
  s_a numeric;
  s_t numeric;
  v_neutral_f boolean := false;
  v_neutral_a boolean := false;
  v_pen_flags numeric;
  v_pen_reports numeric;
  v_pen_strikes numeric;
  v_raw numeric;
  v_score integer;
  v_cap integer := (p_cfg #>> '{bands,watch}')::integer - 1;
  v_capped boolean := false;
  v_band text;
  l_p numeric;
  l_f numeric;
  l_a numeric;
  l_t numeric;
  v_weakest text;
  v_max numeric := 0;
  v_bits text[];
  v_reasons jsonb := '[]'::jsonb;
  v_deleted boolean := p_state = 'deleted';
begin
  v_wsum := w_p + w_f + w_a + w_t;
  if v_wsum <= 0 then
    w_p := 1; w_f := 1; w_a := 1; w_t := 1; v_wsum := 4;
  end if;

  -- profile
  s_p := round(100.0 * v_checks / 8);

  -- freshness: the share of items confirmed recently. Nothing to measure is 0, except for a brand new business.
  if coalesce(p_items, 0) > 0 then
    s_f := round(100.0 * coalesce(p_fresh_items, 0) / p_items);
  elsif v_grace then
    s_f := v_neutral; v_neutral_f := true;
  else
    s_f := 0;
  end if;

  -- activity: full marks up to activity_full_days of silence, falling in a straight line to 0 at activity_zero_days.
  if p_activity_age is null then
    if v_grace then s_a := v_neutral; v_neutral_a := true; else s_a := 0; end if;
  elsif p_activity_age <= v_full then
    s_a := 100;
  elsif p_activity_age >= v_zero then
    s_a := 0;
  else
    s_a := round(100.0 * (v_zero - p_activity_age) / (v_zero - v_full));
  end if;

  -- trust: capped penalties
  v_pen_flags   := least((p_cfg #>> '{trust,flag_cap}')::numeric,   coalesce(p_open_flags, 0)   * (p_cfg #>> '{trust,flag}')::numeric);
  v_pen_reports := least((p_cfg #>> '{trust,report_cap}')::numeric, coalesce(p_open_reports, 0) * (p_cfg #>> '{trust,report}')::numeric);
  v_pen_strikes := least((p_cfg #>> '{trust,strike_cap}')::numeric, coalesce(p_strikes, 0)      * (p_cfg #>> '{trust,strike}')::numeric);
  s_t := greatest(0, 100 - v_pen_flags - v_pen_reports - v_pen_strikes);

  v_raw := (w_p * s_p + w_f * s_f + w_a * s_a + w_t * s_t) / v_wsum;
  v_score := round(v_raw);

  -- points each part costs the total (they add up to 100 minus the uncapped score)
  l_p := w_p / v_wsum * (100 - s_p);
  l_f := w_f / v_wsum * (100 - s_f);
  l_a := w_a / v_wsum * (100 - s_a);
  l_t := w_t / v_wsum * (100 - s_t);

  if l_p > v_max then v_weakest := 'profile';   v_max := l_p; end if;
  if l_f > v_max then v_weakest := 'freshness'; v_max := l_f; end if;
  if l_a > v_max then v_weakest := 'activity';  v_max := l_a; end if;
  if l_t > v_max then v_weakest := 'trust';     v_max := l_t; end if;
  if v_max < 1 then v_weakest := null; end if;

  -- reasons, biggest first (caps on top). 'ord' only sorts them and is removed below.
  if p_state in ('suspended', 'expired') then
    v_reasons := v_reasons || jsonb_build_object('part', 'cap', 'tone', 'bad', 'points', 0, 'ord', 1000,
      'text', case p_state when 'suspended' then 'Suspended' else 'Expired' end || ': the score cannot rise above ' || v_cap);
    if v_score > v_cap then v_score := v_cap; v_capped := true; end if;
  end if;
  if coalesce(p_serious_flags, 0) > 0 then
    v_reasons := v_reasons || jsonb_build_object('part', 'cap', 'tone', 'bad', 'points', 0, 'ord', 999,
      'text', 'Open flag unanswered for over ' || (p_cfg ->> 'serious_flag_days') || ' days: the score cannot rise above ' || v_cap);
    if v_score > v_cap then v_score := v_cap; v_capped := true; end if;
  end if;
  if coalesce(p_strikes, 0) >= (p_cfg ->> 'strike_threshold')::integer then
    v_reasons := v_reasons || jsonb_build_object('part', 'cap', 'tone', 'bad', 'points', 0, 'ord', 998,
      'text', 'Strike threshold reached (' || p_strikes || '): the score cannot rise above ' || v_cap);
    if v_score > v_cap then v_score := v_cap; v_capped := true; end if;
  end if;

  if round(l_p) >= 1 then
    v_reasons := v_reasons || jsonb_build_object('part', 'profile', 'points', round(l_p), 'ord', l_p,
      'tone', case when s_p < v_watch then 'bad' when s_p < v_healthy then 'warn' else 'note' end,
      'text', 'Profile ' || v_checks || ' of 8 complete. Missing: ' || array_to_string(p_missing, ', '));
  end if;
  if round(l_f) >= 1 and not v_neutral_f then
    v_reasons := v_reasons || jsonb_build_object('part', 'freshness', 'points', round(l_f), 'ord', l_f,
      'tone', case when s_f < v_watch then 'bad' when s_f < v_healthy then 'warn' else 'note' end,
      'text', case when coalesce(p_items, 0) = 0 then 'No items listed, so there are no prices to keep fresh'
                   else coalesce(p_fresh_items, 0) || ' of ' || p_items || case when p_items = 1 then ' price' else ' prices' end
                        || ' confirmed in the last ' || p_fresh_days || ' days' end);
  end if;
  if round(l_a) >= 1 and not v_neutral_a then
    v_reasons := v_reasons || jsonb_build_object('part', 'activity', 'points', round(l_a), 'ord', l_a,
      'tone', case when s_a < v_watch then 'bad' when s_a < v_healthy then 'warn' else 'note' end,
      'text', case when p_activity_age is null then 'No login, edit or price confirmation yet'
                   else 'No login, edit or price confirmation for ' || p_activity_age || case when p_activity_age = 1 then ' day' else ' days' end end);
  end if;
  if round(l_t) >= 1 then
    v_bits := array[]::text[];
    if coalesce(p_open_flags, 0) > 0 then v_bits := v_bits || (p_open_flags || ' open ' || case when p_open_flags = 1 then 'flag' else 'flags' end); end if;
    if coalesce(p_open_reports, 0) > 0 then v_bits := v_bits || (p_open_reports || ' open ' || case when p_open_reports = 1 then 'report' else 'reports' end); end if;
    if coalesce(p_strikes, 0) > 0 then v_bits := v_bits || (p_strikes || case when p_strikes = 1 then ' strike' else ' strikes' end); end if;
    v_reasons := v_reasons || jsonb_build_object('part', 'trust', 'points', round(l_t), 'ord', l_t,
      'tone', case when s_t < v_watch then 'bad' when s_t < v_healthy then 'warn' else 'note' end,
      'text', array_to_string(v_bits, ', '));
  end if;
  if v_neutral_f or v_neutral_a then
    v_reasons := v_reasons || jsonb_build_object('part', 'grace', 'tone', 'info', 'points', 0, 'ord', 0.5,
      'text', 'New business: ' || case when v_neutral_f and v_neutral_a then 'freshness and activity are'
                                       when v_neutral_f then 'freshness is' else 'activity is' end
              || ' scored as neutral (' || v_neutral::integer || ') until day ' || (p_cfg ->> 'grace_days'));
  end if;

  select coalesce(jsonb_agg(r - 'ord' order by (r ->> 'ord')::numeric desc), '[]'::jsonb) into v_reasons
    from jsonb_array_elements(v_reasons) as r;

  v_band := case when v_score >= v_healthy then 'healthy' when v_score >= v_watch then 'watch' else 'at_risk' end;

  return jsonb_build_object(
    'score', case when v_deleted then null else v_score end,
    'band', case when v_deleted then 'none' else v_band end,
    'label', case when v_deleted then 'No score'
                  else case v_band when 'healthy' then 'Healthy' when 'watch' then 'Watch' else 'At risk' end end,
    'capped', v_capped and not v_deleted,
    'weakest', case when v_deleted then null else v_weakest end,
    'grace', v_grace,
    'bands', jsonb_build_object('healthy', v_healthy, 'watch', v_watch),
    'subs', jsonb_build_object('profile', s_p::integer, 'freshness', s_f::integer, 'activity', s_a::integer, 'trust', s_t::integer),
    'weights', jsonb_build_object(
      'profile', round(100 * w_p / v_wsum), 'freshness', round(100 * w_f / v_wsum),
      'activity', round(100 * w_a / v_wsum), 'trust', round(100 * w_t / v_wsum)),
    'reasons', case when v_deleted then '[]'::jsonb else v_reasons end);
end $$;

-- ---------------------------------------------------------------------------
-- 3. The raw numbers, one grouped pass each (no subquery per business), and the score on top of them.
-- ---------------------------------------------------------------------------
create or replace view public.business_health_inputs_v with (security_invoker = true) as
select
  b.id as business_id,
  case
    when (b.deleted_at is not null) or b.status = 'deleted' then 'deleted'
    when b.status <> 'live' then b.status
    when b.paid_until is null then 'pending'
    when public.listing_state(b.paid_until, now(), b.grace_days) = 'expired' then 'expired'
    when public.listing_state(b.paid_until, now(), b.grace_days) = 'grace' then 'grace'
    when public.days_left(b.paid_until) <= 7 then 'expiring'
    else 'live'
  end as state,
  (public.nairobi_today() - public.nairobi_day(b.created_at))::integer as age_days,
  array_remove(array[
    case when coalesce(btrim(b.tagline), '') = '' then 'tagline' end,
    case when coalesce(btrim(b.description), '') = '' then 'description' end,
    case when b.logo_path is null then 'logo' end,
    case when b.cover_path is null then 'cover photo' end,
    case when coalesce(btrim(b.address), '') = '' then 'address' end,
    case when coalesce(btrim(b.whatsapp), '') = '' then 'WhatsApp number' end,
    case when coalesce(b.hours, '{}'::jsonb) = '{}'::jsonb then 'opening hours' end,
    case when coalesce(s.items, 0) = 0 then 'items' end
  ], null) as missing,
  coalesce(s.items, 0)::integer as items,
  coalesce(s.fresh_items, 0)::integer as fresh_items,
  coalesce((cfg.c -> 'freshness_days_by_category' ->> b.category_id)::integer, (cfg.c ->> 'freshness_days')::integer) as fresh_days,
  s.price_age_days::integer as price_age_days,      -- the stalest item; null when there are no items (it used to be 0)
  greatest(b.last_login_at, b.last_edit_at, s.last_item_edit, s.last_price_confirm) as last_activity_at,
  (public.nairobi_today() - public.nairobi_day(greatest(b.last_login_at, b.last_edit_at, s.last_item_edit, s.last_price_confirm)))::integer as activity_age_days,
  coalesce(f.open_flags, 0)::integer as open_flags,
  coalesce(f.serious_flags, 0)::integer as serious_flags,
  coalesce(r.open_reports, 0)::integer as open_reports,
  b.strikes
from public.businesses b
cross join (select public.health_config() as c) cfg
left join (
  select i.business_id,
         count(*) as items,
         count(*) filter (where public.nairobi_today() - public.nairobi_day(i.price_confirmed_at) <= w.days) as fresh_items,
         max(public.nairobi_today() - public.nairobi_day(i.price_confirmed_at)) as price_age_days,
         max(i.updated_at) as last_item_edit,
         max(i.price_confirmed_at) as last_price_confirm
    from public.items i
    join public.businesses bb on bb.id = i.business_id
    cross join (select public.health_config() as c) k
    cross join lateral (select coalesce((k.c -> 'freshness_days_by_category' ->> bb.category_id)::integer, (k.c ->> 'freshness_days')::integer) as days) w
   where not i.removed_by_admin
   group by i.business_id
) s on s.business_id = b.id
left join (
  select fl.business_id,
         count(*) as open_flags,
         count(*) filter (where fl.status = 'open'
                            and public.nairobi_today() - public.nairobi_day(fl.created_at) > (k.c ->> 'serious_flag_days')::integer) as serious_flags
    from public.flags fl
    cross join (select public.health_config() as c) k
   where fl.status in ('open', 'replied')
   group by fl.business_id
) f on f.business_id = b.id
left join (
  select rp.business_id, count(*) as open_reports
    from public.reports rp
   where rp.status = 'open'
   group by rp.business_id
) r on r.business_id = b.id;

create or replace view public.business_health_v with (security_invoker = true) as
select i.*,
       public.business_health(i.state, i.age_days, i.missing, i.items, i.fresh_items, i.fresh_days, i.activity_age_days,
                              i.open_flags, i.serious_flags, i.open_reports, i.strikes, cfg.c) as health
  from public.business_health_inputs_v i
  cross join (select public.health_config() as c) cfg;

revoke all on public.business_health_inputs_v, public.business_health_v from public, anon;
grant select on public.business_health_inputs_v, public.business_health_v to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Daily snapshots: history, a 7-day trend, and the data to calibrate the weights against real non-renewals later.
--    The four parts are stored, so any other set of weights can be replayed over the past.
-- ---------------------------------------------------------------------------
create table if not exists public.business_health_snapshots (
  business_id uuid not null references public.businesses(id) on delete cascade,
  day date not null,
  score smallint not null check (score between 0 and 100),
  band text not null check (band in ('healthy', 'watch', 'at_risk')),
  state text not null,
  profile smallint not null,
  freshness smallint not null,
  activity smallint not null,
  trust smallint not null,
  capped boolean not null default false,
  reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (business_id, day)
);
create index if not exists business_health_snapshots_day_idx on public.business_health_snapshots (day, score);

alter table public.business_health_snapshots enable row level security;
drop policy if exists "admin reads health snapshots" on public.business_health_snapshots;
create policy "admin reads health snapshots" on public.business_health_snapshots for select to authenticated using (public.is_admin());
revoke all on public.business_health_snapshots from public, anon, authenticated;
grant select on public.business_health_snapshots to authenticated;
grant all on public.business_health_snapshots to service_role;

-- Called by the daily job (daily-lifecycle). Running it again the same day just refreshes that day's rows.
-- Deleted businesses are not scored. Snapshots older than 400 days are dropped.
create or replace function public.snapshot_business_health(p_day date default null) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_day date := coalesce(p_day, public.nairobi_today());
  v_n integer;
begin
  insert into public.business_health_snapshots as s (business_id, day, score, band, state, profile, freshness, activity, trust, capped, reasons)
  select h.business_id, v_day, (h.health ->> 'score')::integer, h.health ->> 'band', h.state,
         (h.health #>> '{subs,profile}')::integer, (h.health #>> '{subs,freshness}')::integer,
         (h.health #>> '{subs,activity}')::integer, (h.health #>> '{subs,trust}')::integer,
         (h.health ->> 'capped')::boolean, h.health -> 'reasons'
    from public.business_health_v h
   where h.state <> 'deleted'
  on conflict (business_id, day) do update
    set score = excluded.score, band = excluded.band, state = excluded.state, profile = excluded.profile,
        freshness = excluded.freshness, activity = excluded.activity, trust = excluded.trust,
        capped = excluded.capped, reasons = excluded.reasons, created_at = now();
  get diagnostics v_n = row_count;
  delete from public.business_health_snapshots where day < v_day - 400;
  return v_n;
end $$;
revoke all on function public.snapshot_business_health(date) from public, anon, authenticated;
grant execute on function public.snapshot_business_health(date) to service_role;

-- ---------------------------------------------------------------------------
-- 5. The admin list. admin_businesses_v now carries the score, band, breakdown and 7-day trend from business_health_v, and the
--    three per-row subqueries (items, flags, reports) are gone. price_age_days and login_age_days are no longer columns: nothing
--    reads them, and both were part of the bugs.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_businesses_filtered(jsonb, text);
drop view if exists public.admin_businesses_v;

create view public.admin_businesses_v with (security_invoker = true) as
select
  b.id,
  b.seller_id,
  b.slug,
  b.name,
  c.name as category,
  b.county,
  b.town,
  b.owner_name,
  b.phone,
  initcap(b.plan_key) as plan,
  (b.verification_level = 'verified') as verified,
  b.featured,
  ((b.deleted_at is not null) or (b.status = 'deleted')) as deleted,
  case when (b.status = 'live' and b.paid_until is null) then 'pending' else b.status end as ui_status,
  b.paid_until,
  public.nairobi_day(b.paid_until) as paid_day,
  public.days_left(b.paid_until) as days_left,
  h.state,
  h.items,
  h.open_flags,
  h.open_reports,
  exists (select 1 from public.payments p where p.business_id = b.id and p.status = 'submitted') as unconfirmed_payment,
  b.strikes,
  b.tags,
  b.last_login_at,
  coalesce(b.last_edit_at, b.updated_at) as last_edit_at,
  b.created_at,
  public.nairobi_day(b.created_at) as created_day,
  (h.health #>> '{subs,profile}')::integer as completeness,
  (h.health ->> 'score')::integer as health_score,
  h.health ->> 'band' as health_band,
  h.health as health,
  ((h.health ->> 'score')::integer - p.score)::integer as health_trend
from public.businesses b
left join public.categories c on c.id = b.category_id
join public.business_health_v h on h.business_id = b.id
left join (
  select distinct on (s.business_id) s.business_id, s.score
    from public.business_health_snapshots s
   where s.day between public.nairobi_today() - 14 and public.nairobi_today() - 7
   order by s.business_id, s.day desc
) p on p.business_id = b.id;

revoke all on public.admin_businesses_v from public, anon;
grant select on public.admin_businesses_v to authenticated, service_role;

create or replace function public.admin_businesses_filtered(p_filters jsonb default '{}', p_search text default null)
returns setof public.admin_businesses_v
language sql stable security invoker set search_path = public as $$
  select v.*
    from public.admin_businesses_v v
   where public.is_admin()
     and (coalesce(p_filters->>'category', '') = '' or v.category = p_filters->>'category')
     and (coalesce(p_filters->>'county', '')   = '' or v.county   = p_filters->>'county')
     and (coalesce(p_filters->>'town', '')     = '' or v.town     = p_filters->>'town')
     and (coalesce(p_filters->>'plan', '')     = '' or v.plan     = p_filters->>'plan')
     and (coalesce(p_filters->>'verified', '') = '' or v.verified = (p_filters->>'verified' = 'yes'))
     and (coalesce(p_filters->>'featured', '') = '' or v.featured = (p_filters->>'featured' = 'yes'))
     and (coalesce(p_filters->>'status', '')   = '' or v.state    = p_filters->>'status')
     and (coalesce(p_filters->>'health', '')   = '' or v.health_band = p_filters->>'health')
     and (coalesce(p_filters->>'daysMin', '') = '' or v.days_left >= (p_filters->>'daysMin')::numeric)
     and (coalesce(p_filters->>'daysMax', '') = '' or v.days_left <= (p_filters->>'daysMax')::numeric)
     and (coalesce(p_filters->>'hasFlags', 'false') <> 'true' or v.open_flags > 0)
     and (coalesce(p_filters->>'hasUnconfirmed', 'false') <> 'true' or v.unconfirmed_payment)
     and (coalesce(p_filters->>'agent', '') = ''
          or (p_filters->>'agent' = '__none__' and not exists (select 1 from public.businesses x where x.id = v.id and x.agent is not null))
          or exists (select 1 from public.businesses x where x.id = v.id and x.agent = p_filters->>'agent'))
     and (coalesce(p_filters->>'createdFrom', '') = '' or v.created_day >= (p_filters->>'createdFrom')::date)
     and (coalesce(p_filters->>'createdTo', '')   = '' or v.created_day <= (p_filters->>'createdTo')::date)
     and (btrim(coalesce(p_search, '')) = '' or
          v.name ilike '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
       or v.phone ilike '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
       or v.seller_id ilike '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
       or v.slug ilike '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
       or v.owner_name ilike '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%')
$$;
revoke all on function public.admin_businesses_filtered(jsonb, text) from public, anon;
grant execute on function public.admin_businesses_filtered(jsonb, text) to authenticated, service_role;

-- Same as 0061, except: healthScore sorts on the view's health_score column (no formula pasted into the ORDER BY), and each
-- row carries 'health' (the breakdown) and 'healthTrend' (points gained or lost against about 7 days ago; null until then).
create or replace function public.admin_businesses_query(
  p_tab text default 'all', p_search text default null, p_sort text default 'paidUntil', p_dir text default 'asc',
  p_filters jsonb default '{}', p_limit integer default 50, p_offset integer default 0
) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_order text;
  v_dir text := case when lower(coalesce(p_dir, 'asc')) = 'desc' then 'desc' else 'asc' end;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 5000);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total bigint;
  v_rows jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Only these columns can be sorted on: the key is looked up here, never pasted into the query.
  v_order := case p_sort
    when 'name' then 'lower(name)'
    when 'items' then 'items'
    when 'healthScore' then 'health_score'
    when 'lastLogin' then 'last_login_at'
    when 'createdAt' then 'created_at'
    when 'lastEdit' then 'last_edit_at'
    when 'strikes' then 'strikes'
    else 'paid_until'
  end;

  select count(*) into v_total
    from public.admin_businesses_filtered(p_filters, p_search) v
   where public.admin_business_in_tab(p_tab, v.state, v.open_flags);

  execute format($q$
    select coalesce(jsonb_agg(r.j order by r.rn), '[]'::jsonb) from (
      select row_number() over (order by %1$s %2$s nulls last, id) as rn,
        jsonb_build_object(
          'id', id, 'sellerId', seller_id, 'slug', slug, 'name', name, 'category', coalesce(category, ''),
          'county', coalesce(county, ''), 'town', coalesce(town, ''), 'ownerName', coalesce(owner_name, ''),
          'phone', coalesce(phone, ''), 'plan', plan, 'verified', verified, 'featured', featured,
          'status', ui_status, 'paidUntil', to_char(paid_day, 'YYYY-MM-DD'), 'items', items,
          'openFlags', open_flags, 'strikes', strikes, 'completeness', completeness, 'openReports', open_reports,
          'healthScore', health_score, 'healthBand', health_band, 'health', health, 'healthTrend', health_trend,
          'lastLogin', last_login_at, 'lastEdit', last_edit_at, 'createdAt', created_at,
          'state', state, 'agent', (select x.agent from public.businesses x where x.id = v.id), 'tags', to_jsonb(tags), 'deleted', deleted, 'unconfirmedPayment', unconfirmed_payment
        ) as j
      from public.admin_businesses_filtered($1, $2) v
      where public.admin_business_in_tab($3, v.state, v.open_flags)
      order by %1$s %2$s nulls last, id
      limit $4 offset $5
    ) r
  $q$, v_order, v_dir)
  into v_rows
  using p_filters, p_search, p_tab, v_limit, v_offset;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end $$;

-- One business: the live breakdown plus its last 30 days of snapshots, for the business page.
create or replace function public.admin_business_health(p_business uuid) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'current', (select h.health from public.business_health_v h where h.business_id = p_business),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('day', s.day, 'score', s.score, 'band', s.band) order by s.day)
        from public.business_health_snapshots s
       where s.business_id = p_business and s.day >= public.nairobi_today() - 29), '[]'::jsonb));
end $$;
revoke all on function public.admin_business_health(uuid) from public, anon;
grant execute on function public.admin_business_health(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Tuning. Owner only, validated strictly (a settings form should say "no", not silently clamp), audited like the other settings.
-- ---------------------------------------------------------------------------
create or replace function public.health_int_ok(p jsonb, p_path text[], p_min integer, p_max integer) returns boolean
language plpgsql immutable as $$
declare
  v text := p #>> p_path;
begin
  return case when v ~ '^[0-9]{1,4}$' then v::integer between p_min and p_max else false end;
end $$;

create or replace function public.admin_get_health_config() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(array[]::text[]) then raise exception 'forbidden' using errcode = '42501'; end if;
  return public.health_config() - 'strike_threshold';
end $$;

create or replace function public.admin_save_health_config(p_config jsonb, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
  v_ok boolean;
  v_entry record;
begin
  if not public.has_role(array[]::text[]) then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_config) is distinct from 'object' then raise exception 'invalid_health_config' using errcode = '22023'; end if;
  v_before := public.health_config() - 'strike_threshold';

  v_ok := public.health_int_ok(p_config, '{weights,profile}', 0, 100)
      and public.health_int_ok(p_config, '{weights,freshness}', 0, 100)
      and public.health_int_ok(p_config, '{weights,activity}', 0, 100)
      and public.health_int_ok(p_config, '{weights,trust}', 0, 100)
      and public.health_int_ok(p_config, '{grace_days}', 0, 90)
      and public.health_int_ok(p_config, '{neutral}', 0, 100)
      and public.health_int_ok(p_config, '{freshness_days}', 1, 365)
      and public.health_int_ok(p_config, '{activity_full_days}', 0, 90)
      and public.health_int_ok(p_config, '{activity_zero_days}', 1, 365)
      and public.health_int_ok(p_config, '{trust,flag}', 0, 100)
      and public.health_int_ok(p_config, '{trust,flag_cap}', 0, 100)
      and public.health_int_ok(p_config, '{trust,report}', 0, 100)
      and public.health_int_ok(p_config, '{trust,report_cap}', 0, 100)
      and public.health_int_ok(p_config, '{trust,strike}', 0, 100)
      and public.health_int_ok(p_config, '{trust,strike_cap}', 0, 100)
      and public.health_int_ok(p_config, '{serious_flag_days}', 0, 90)
      and public.health_int_ok(p_config, '{bands,healthy}', 2, 100)
      and public.health_int_ok(p_config, '{bands,watch}', 1, 99);
  if not v_ok then raise exception 'invalid_health_config' using errcode = '22023'; end if;

  if (p_config #>> '{weights,profile}')::integer + (p_config #>> '{weights,freshness}')::integer
     + (p_config #>> '{weights,activity}')::integer + (p_config #>> '{weights,trust}')::integer <= 0 then
    raise exception 'invalid_health_weights' using errcode = '22023';
  end if;
  if (p_config #>> '{bands,watch}')::integer >= (p_config #>> '{bands,healthy}')::integer then
    raise exception 'invalid_health_bands' using errcode = '22023';
  end if;
  if (p_config ->> 'activity_zero_days')::integer <= (p_config ->> 'activity_full_days')::integer then
    raise exception 'invalid_health_activity' using errcode = '22023';
  end if;
  if p_config ? 'freshness_days_by_category' then
    if jsonb_typeof(p_config -> 'freshness_days_by_category') <> 'object' then
      raise exception 'invalid_health_config' using errcode = '22023';
    end if;
    for v_entry in select e.key, e.value from jsonb_each(p_config -> 'freshness_days_by_category') e loop
      if v_entry.key !~ '^[a-z0-9-]{2,50}$' or not public.health_int_ok(jsonb_build_object('v', v_entry.value), '{v}', 1, 365) then
        raise exception 'invalid_health_config' using errcode = '22023';
      end if;
    end loop;
  end if;

  insert into public.site_settings (key, value) values ('health_config', public.health_normalize(p_config))
  on conflict (key) do update set value = excluded.value, updated_at = now();

  perform public.admin_audit_action('settings.update', 'settings', 'health', v_before,
    public.health_config() - 'strike_threshold', nullif(btrim(coalesce(p_reason, '')), ''));
  return public.health_config() - 'strike_threshold';
end $$;

revoke all on function public.health_num(jsonb, text[], numeric, numeric, numeric), public.health_normalize(jsonb),
  public.health_config(), public.business_health(text, integer, text[], integer, integer, integer, integer, integer, integer, integer, integer, jsonb),
  public.health_int_ok(jsonb, text[], integer, integer) from public, anon;
grant execute on function public.health_num(jsonb, text[], numeric, numeric, numeric), public.health_normalize(jsonb),
  public.health_config(), public.business_health(text, integer, text[], integer, integer, integer, integer, integer, integer, integer, integer, jsonb),
  public.health_int_ok(jsonb, text[], integer, integer) to authenticated, service_role;
revoke all on function public.admin_get_health_config(), public.admin_save_health_config(jsonb, text) from public, anon;
grant execute on function public.admin_get_health_config(), public.admin_save_health_config(jsonb, text) to authenticated, service_role;

-- First snapshot, so the trend starts counting from today.
select public.snapshot_business_health();
