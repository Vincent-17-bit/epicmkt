-- Phone numbers: accept any country. Kenyan local forms (07..., 01..., 254...) become +254...,
-- anything else must be written as +CC... or 00CC... with 8 to 15 digits in total.
create or replace function public.normalize_phone_ke(p text) returns text
language sql immutable as
$$ select coalesce(
     (select '+254' || m[1]
        from regexp_match(regexp_replace(coalesce(p, ''), '[ ()\-.]', '', 'g'), '^(?:254|0)([1-9][0-9]{8})$') as m),
     (select '+' || m[1]
        from regexp_match(regexp_replace(coalesce(p, ''), '[ ()\-.]', '', 'g'), '^(?:\+|00)([1-9][0-9]{7,14})$') as m)
   ) $$;
