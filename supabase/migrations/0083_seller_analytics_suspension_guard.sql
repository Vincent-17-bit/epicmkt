-- 0083_seller_analytics_suspension_guard.sql
-- 0082 added three seller read functions without the suspension guard that every other seller function has, so a
-- suspended seller could still read their Performance numbers, item history and item deals. The repo's own rule
-- (conversations.test.mjs: "every plpgsql seller function refuses a suspended seller") already flagged it.
--
-- Same mechanism 0016 used: make perform public.assert_seller_active() the first statement of each function, by rewriting the
-- stored definition rather than copying its body here (a copy would drift from 0082). Nothing else about the functions changes:
-- CREATE OR REPLACE keeps their grants and ownership. Safe to run again: a function that already has the guard is skipped.
-- It raises if one of the three is missing or the rewrite finds no begin to hook into, so it can never silently do nothing.
do $$
declare
  r record;
  def text;
  patched integer := 0;
  found integer := 0;
begin
  for r in
    select p.oid, p.proname from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('seller_performance', 'seller_item_history', 'seller_item_deals')
  loop
    found := found + 1;
    def := pg_get_functiondef(r.oid);
    if position('assert_seller_active' in def) = 0 then
      def := regexp_replace(def, E'\nbegin\n', E'\nbegin\n  perform public.assert_seller_active();\n', 'i');
      if position('assert_seller_active' in def) = 0 then
        raise exception '0083: could not add the guard to %', r.proname;
      end if;
      execute def;
      patched := patched + 1;
    end if;
  end loop;
  if found <> 3 then
    raise exception '0083: expected 3 seller analytics functions (from 0082), found %', found;
  end if;
  raise notice '0083: guarded % of 3 functions (the rest already were)', patched;
end $$;
