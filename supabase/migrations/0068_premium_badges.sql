-- 0068_premium_badges.sql
-- A business on the Premium plan is Featured automatically. Verified is NOT touched: it only comes from the admin's
-- document check (verification_level), never from the plan.
--
--   1. Trigger: when a business is created on Premium, or its plan changes to Premium (upgrade payment, plan change at
--      renewal, admin edit), featured is switched on once. If an admin later un-features it, that choice stays until the
--      plan next changes to Premium.
--   2. Leaving Premium switches Featured off.
--   3. Backfill: existing Premium businesses become Featured.
-- Additive and safe to run again.

create or replace function public.apply_premium_badges() returns trigger
language plpgsql as $$
begin
  if new.plan_key = 'premium' then
    if tg_op = 'INSERT' or old.plan_key is distinct from 'premium' then
      new.featured := true;
    end if;
  elsif tg_op = 'UPDATE' and old.plan_key = 'premium' then
    new.featured := false;
  end if;
  return new;
end $$;

drop trigger if exists trg_apply_premium_badges on public.businesses;
create trigger trg_apply_premium_badges
  before insert or update of plan_key on public.businesses
  for each row execute function public.apply_premium_badges();

update public.businesses set featured = true where plan_key = 'premium' and featured is not true;
