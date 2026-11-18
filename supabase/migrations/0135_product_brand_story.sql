create or replace function public.item_specs_valid(p jsonb) returns boolean
language plpgsql immutable parallel safe as $$
declare
  e jsonb;
  k text;
  g text;
  c_groups constant text[] := array['Features & Specs', 'Measurements', 'Additional details', 'User guide', 'Item details'];
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 80 then return false; end if;
  for e in select jsonb_array_elements(p) loop
    if jsonb_typeof(e) <> 'object' then return false; end if;
    for k in select jsonb_object_keys(e) loop
      if k not in ('group', 'label', 'value') then return false; end if;
    end loop;
    if jsonb_typeof(e -> 'group') is distinct from 'string' then return false; end if;
    g := e ->> 'group';
    if g <> all (c_groups) and not (g like 'Info: %' and char_length(g) <= 40) then return false; end if;
    if g = 'Info: FAQ' then
      if not public.item_detail_text_ok(e -> 'label', 160) or not public.item_detail_text_ok(e -> 'value', 600) then return false; end if;
    elsif g = 'Info: Brand' then
      if not public.item_detail_text_ok(e -> 'label', 80) or not public.item_detail_text_ok(e -> 'value', 600) then return false; end if;
    elsif not public.item_detail_text_ok(e -> 'label', 40) or not public.item_detail_text_ok(e -> 'value', 120) then return false; end if;
  end loop;
  return true;
end $$;
