-- 0155_staff_socials.sql
-- Team members can link their social profiles: X, Instagram, LinkedIn, Reddit and Facebook. A customer taps an icon on the shop page and
-- the person's own profile opens.
--
-- Stored as one jsonb object on the staff row: { "x": "https://x.com/jane", "instagram": "https://www.instagram.com/jane/", ... }.
-- Only the five networks above are allowed, each value must be exactly the canonical address the app builds (the patterns below are the
-- same ones as parseSocial in shared/src/seller/socials.js, so change them together). That keeps every stored link on the network it is
-- labelled with, with no script, no tracking tail and no look-alike host, even if a row is written some way other than the seller app.
-- (The app also refuses reserved paths such as facebook.com/sharer or x.com/home; the database guarantees the host and the shape, which is
-- what matters for safety, and the app is the stricter of the two.)
-- public_staff exposes the object; the customer page checks it again before drawing a link. Re-runnable.

create or replace function public.staff_socials_ok(p jsonb) returns boolean
language sql immutable as
$$
  select jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_each(p) e
        where jsonb_typeof(e.value) <> 'string'
           or not (case e.key
             when 'x' then (e.value #>> '{}') ~ '^https://x\.com/[A-Za-z0-9_]{1,15}$'
             when 'instagram' then (e.value #>> '{}') ~ '^https://www\.instagram\.com/[A-Za-z0-9._]{1,30}/$'
             when 'linkedin' then (e.value #>> '{}') ~ '^https://www\.linkedin\.com/(in|company|school)/[A-Za-z0-9_%.-]{3,100}$'
             when 'reddit' then (e.value #>> '{}') ~ '^https://www\.reddit\.com/(user/[A-Za-z0-9_-]{3,20}|r/[A-Za-z0-9_]{2,21})$'
             when 'facebook' then (e.value #>> '{}') ~ '^https://www\.facebook\.com/([A-Za-z0-9.]{5,50}|profile\.php\?id=[0-9]{1,20})$'
             else false end)
     )
$$;
grant execute on function public.staff_socials_ok(jsonb) to anon, authenticated, service_role;

alter table public.staff_members add column if not exists socials jsonb not null default '{}'::jsonb;
alter table public.staff_members drop constraint if exists staff_members_socials_ok;
alter table public.staff_members add constraint staff_members_socials_ok check (public.staff_socials_ok(socials));

-- The public view as it was in 0147, with socials added at the end.
create or replace view public.public_staff with (security_invoker = false) as
select s.id, s.business_id, b.slug as business_slug, s.name, s.role, s.specialties, s.photo_path, s.sort,
       case when b.plan_key = 'premium'
            then coalesce((select array_agg(ss.item_id) from public.staff_services ss where ss.staff_id = s.id), '{}'::uuid[])
            else '{}'::uuid[] end as item_ids,
       s.socials
from public.staff_members s
join public.businesses b on b.id = s.business_id
where public.business_is_visible(b) and not s.hidden_by_admin and not s.removed_by_admin and coalesce(s.admin_status, 'ok') = 'ok';

revoke all on public.public_staff from public;
grant select on public.public_staff to anon, authenticated, service_role;
