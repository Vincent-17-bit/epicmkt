-- 0062_seller_prefs_enforced.sql
-- Makes the seller's saved preferences (0060) actually do something.
--
--   1. Notification preferences. A trigger on `messages` applies the seller's choices at the moment a message is queued:
--        * critical events (expiry, payment, admin questions, suspension) are never held back or dropped;
--        * a non-critical text or email the seller switched off is not queued at all;
--        * a non-critical in-app message the seller switched off arrives already read (no unread badge);
--        * a non-critical text or email waits for the seller's own quiet hours to end (Nairobi time, like site quiet hours).
--      Messages with no matching event (approvals, general notes from the team) are never touched.
--   2. The public shop page can read three seller settings through public_businesses.shop_settings:
--      the WhatsApp greeting, whether to show "Closes ..." text, and the partial-closure message (only when something
--      is sold out or unavailable).
-- Additive and safe to run again.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Notification preferences
-- ---------------------------------------------------------------------------------------------------------------------
-- Which seller event a message belongs to, from its kind. null = not covered by a preference.
create or replace function public.message_event_key(p_kind text) returns text
language sql immutable as $$
  select case p_kind
    when 'reminder' then 'expiry' when 'grace' then 'expiry' when 'expiry' then 'expiry'
    when 'payment' then 'payment'
    when 'question' then 'admin_question'
    when 'strike' then 'suspension'
    when 'change' then 'change_decision'
    when 'report' then 'customer_report'
    when 'removal' then 'removal'
    else null end
$$;

create or replace function public.event_is_critical(p_event text) returns boolean
language sql immutable as $$ select p_event in ('expiry', 'payment', 'admin_question', 'suspension') $$;

-- The channel defaults the seller screen shows when nothing has been saved.
create or replace function public.notify_default(p_event text, p_channel text) returns boolean
language sql immutable as $$
  select case p_channel
    when 'in_app' then true
    when 'sms' then p_event <> 'customer_report' and p_event <> 'closure_reminder'
    else false end
$$;

create or replace function public.notify_wanted(p_settings jsonb, p_event text, p_channel text) returns boolean
language sql immutable as $$
  select coalesce((p_settings #>> array['notifications', 'events', p_event, p_channel])::boolean, public.notify_default(p_event, p_channel))
$$;

-- When the seller's own quiet hours end, or null when they are not in them (or have none on).
create or replace function public.notify_quiet_release(p_settings jsonb, p_now timestamptz) returns timestamptz
language plpgsql immutable as $$
declare
  q jsonb := coalesce(p_settings -> 'notifications' -> 'quiet_hours', '{}'::jsonb);
  s time := coalesce((q ->> 'start')::time, time '21:00');
  e time := coalesce((q ->> 'end')::time, time '07:00');
  t time := (p_now at time zone 'Africa/Nairobi')::time;
  d date := (p_now at time zone 'Africa/Nairobi')::date;
  inside boolean;
  r timestamptz;
begin
  if coalesce((q ->> 'enabled')::boolean, true) is not true or s = e then return null; end if;
  inside := case when s < e then t >= s and t < e else t >= s or t < e end;
  if not inside then return null; end if;
  r := (d + e) at time zone 'Africa/Nairobi';
  if r <= p_now then r := ((d + 1) + e) at time zone 'Africa/Nairobi'; end if;
  return r;
exception when others then
  return null;   -- a malformed setting must never hold back a message
end $$;

create or replace function public.messages_apply_seller_prefs() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_event text := public.message_event_key(new.kind);
  v_settings jsonb;
  v_release timestamptz;
begin
  if new.business_id is null or v_event is null or public.event_is_critical(v_event) or new.transactional then return new; end if;
  select s.settings into v_settings from public.seller_settings s where s.business_id = new.business_id;
  v_settings := coalesce(v_settings, '{}'::jsonb);
  if not public.notify_wanted(v_settings, v_event, new.channel) then
    if new.channel = 'in_app' then
      new.read_at := coalesce(new.read_at, now());
      return new;
    end if;
    return null;   -- the seller does not want this text or email: it is never queued
  end if;
  if new.channel in ('sms', 'email') and new.status = 'queued' then
    v_release := public.notify_quiet_release(v_settings, greatest(coalesce(new.scheduled_at, now()), now()));
    if v_release is not null then new.scheduled_at := v_release; end if;
  end if;
  return new;
end $$;
revoke all on function public.messages_apply_seller_prefs() from public, anon, authenticated;

drop trigger if exists t_messages_seller_prefs on public.messages;
create trigger t_messages_seller_prefs before insert on public.messages for each row execute function public.messages_apply_seller_prefs();

revoke all on function public.message_event_key(text), public.event_is_critical(text), public.notify_default(text, text),
  public.notify_wanted(jsonb, text, text), public.notify_quiet_release(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.message_event_key(text), public.event_is_critical(text), public.notify_default(text, text),
  public.notify_wanted(jsonb, text, text), public.notify_quiet_release(jsonb, timestamptz) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Seller settings the public shop page reads
-- ---------------------------------------------------------------------------------------------------------------------
-- New column goes last so the view can be replaced in place.
create or replace view public.public_businesses with (security_barrier = true) as
select
  b.id, b.slug, b.name, b.category_id, b.plan_key, b.verification_level, b.tagline, b.description,
  b.phone, b.whatsapp, b.socials, b.amenities, b.payment_methods, b.delivery_area,
  b.county, b.town, b.address, b.lat, b.lng, b.logo_path, b.cover_path, b.tags, b.hours, b.created_at,
  public.public_exceptions(b.exceptions) as exceptions,
  (select count(*)::integer from public.items i
    where i.business_id = b.id and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin
      and public.item_is_listed(i.availability)) as product_count,
  b.timezone,
  jsonb_strip_nulls(jsonb_build_object(
    'whatsapp_greeting', b.profile ->> 'whatsapp_greeting',
    'show_closes_chip', case when b.profile ? 'show_closes_chip' then (b.profile ->> 'show_closes_chip')::boolean end,
    'partial_closure_message',
      case when exists (select 1 from public.items i
                         where i.business_id = b.id and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin
                           and not public.item_is_listed(i.availability))
           then b.profile ->> 'partial_closure_message' end
  )) as shop_settings
from public.businesses b
where public.business_is_visible(b);
revoke all on public.public_businesses from public;
grant select on public.public_businesses to anon, authenticated, service_role;
