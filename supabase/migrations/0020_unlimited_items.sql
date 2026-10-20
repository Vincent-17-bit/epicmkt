-- 0020_unlimited_items.sql
-- Sellers can list as many items as they like, on every plan.
--
-- plans.items_limit becomes optional: NULL means "no limit". The insert trigger public.enforce_limit() and the
-- seller RPCs (0005, 0017, 0019) already treat a NULL limit as unlimited, so setting every plan to NULL is all
-- the enforcement needs. The column is kept so a limit can still be set later for a single plan if ever wanted.
-- The wording that told people "Up to N items" is rewritten too, so no screen advertises a cap that is gone.
--
-- Safe to run more than once.

alter table public.plans alter column items_limit drop not null;
comment on column public.plans.items_limit is 'Maximum items a seller may list on this plan. NULL = unlimited (the default for every plan).';

update public.plans set items_limit = null where items_limit is not null;

update public.plans
set
  top_benefits = (
    select jsonb_agg(to_jsonb(regexp_replace(b.value, 'Up to [0-9]+ items', 'Unlimited items')) order by b.ord)
    from jsonb_array_elements_text(public.plans.top_benefits) with ordinality as b(value, ord)
  ),
  features = regexp_replace(features::text, 'Up to [0-9]+ items', 'Unlimited items', 'g')::jsonb
where top_benefits::text ~ 'Up to [0-9]+ items' or features::text ~ 'Up to [0-9]+ items';
