-- 0068_premium_badges.sql
-- A business on the Premium plan is Verified and Featured automatically.
--
-- Before this, "Verified" (businesses.verification_level) was only set by an admin's paper check and "Featured"
-- (businesses.featured) only by an admin action, so a Premium business showed Verified = No and Featured = No in the admin
-- Businesses table. Customers saw the featured list by plan_key, so the admin table and the public site disagreed.
--
--   1. Trigger: whenever a business is created on Premium, or its plan becomes Premium (the 'upgrade' payment in
--      mpesa_confirm_payment, a plan change applied at renewal, or an admin edit), it is marked verified and featured.
--   2. Leaving Premium switches Featured off. Verified is left as it is, because a standard business can also earn it
--      through the admin paper check and the two cannot be told apart.
--   3. Backfill for businesses that are already on Premium.
-- Additive and safe to run again.

create or replace function public.apply_premium_badges() returns trigger
language plpgsql as $$
begin
  if new.plan_key = 'premium' then
    new.verification_level := 'verified';
    new.featured := true;
  elsif tg_op = 'UPDATE' and old.plan_key = 'premium' then
    new.featured := false;
  end if;
  return new;
end $$;

drop trigger if exists trg_apply_premium_badges on public.businesses;
create trigger trg_apply_premium_badges
  before insert or update of plan_key on public.businesses
  for each row execute function public.apply_premium_badges();

update public.businesses
   set verification_level = 'verified', featured = true
 where plan_key = 'premium'
   and (verification_level <> 'verified' or featured is not true);
