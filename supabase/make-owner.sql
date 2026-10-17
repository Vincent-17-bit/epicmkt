-- Make one Supabase Auth user the first EpicMKT admin (role: owner).
--
-- 1. Supabase dashboard > Authentication > Users > Add user > Create new user.
--    Enter the e-mail and a strong password and tick "Auto Confirm User".
-- 2. Replace the two values in the `params` block below (keep the quotes).
-- 3. Supabase dashboard > SQL Editor > paste this whole file > Run.
--
-- It is safe to run again: it updates the same admin row instead of adding a second one.
-- Do not commit your real e-mail address to this file.

with params as (
  select 'you@example.com'::text as admin_email,
         'Your Name'::text       as admin_name
),
upsert as (
  insert into public.admins (user_id, role, email, display_name)
  select u.id, 'owner', u.email, p.admin_name
  from auth.users u
  join params p on lower(u.email) = lower(p.admin_email)
  on conflict (user_id) do update
    set role = excluded.role,
        email = excluded.email,
        display_name = excluded.display_name
  returning user_id, email, role, display_name
)
select * from upsert;

-- The result above must show exactly one row with role = owner.
-- Zero rows means no Auth user has that e-mail: create the user in step 1, or fix the spelling.

-- Check at any time:
-- select user_id, email, role, display_name from public.admins;
