-- 0158: old phone numbers, WhatsApp numbers and sign-in emails are kept, and a phone change can update WhatsApp too.
--
-- 1. business_contact_history keeps every number and sign-in email a business has had. A trigger on businesses writes a row
--    whenever phone, whatsapp or login_email changes, whoever changes it (the seller through an edge function or their profile, an
--    admin approving a request, or an admin editing). Nothing here is deleted by the app: only the owner can remove an entry,
--    through admin_delete_contact_history, and that is itself written to the audit log.
-- 2. seller_set_verified_phone takes an extra flag so the seller can use the new number for WhatsApp as well.
-- 3. admin_contact_history lists the history of one business for the admin site.
--
-- The table has no policies and no grants: browsers cannot read or write it, only these functions can.

create table if not exists public.business_contact_history (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  field text not null check (field in ('phone', 'whatsapp', 'login_email')),
  old_value text not null,
  new_value text, -- null when the value was cleared
  changed_at timestamptz not null default clock_timestamp(), -- not now(): one update can add several rows, and they should stay in order
  changed_by uuid  -- auth.uid(): an admin's id when an admin did it; null when a server function did it for the seller
);
create index if not exists business_contact_history_business on public.business_contact_history (business_id, changed_at desc);
alter table public.business_contact_history enable row level security;
revoke all on public.business_contact_history from public, anon, authenticated;

create or replace function public.business_contact_history_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.phone is not null and new.phone is distinct from old.phone then
    insert into public.business_contact_history (business_id, field, old_value, new_value, changed_by) values (new.id, 'phone', old.phone, new.phone, auth.uid());
  end if;
  if old.whatsapp is not null and new.whatsapp is distinct from old.whatsapp then
    insert into public.business_contact_history (business_id, field, old_value, new_value, changed_by) values (new.id, 'whatsapp', old.whatsapp, new.whatsapp, auth.uid());
  end if;
  if old.login_email is not null and new.login_email is distinct from old.login_email then
    insert into public.business_contact_history (business_id, field, old_value, new_value, changed_by) values (new.id, 'login_email', old.login_email, new.login_email, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists business_contact_history_trg on public.businesses;
create trigger business_contact_history_trg after update of phone, whatsapp, login_email on public.businesses
  for each row execute function public.business_contact_history_log();

-- The verified phone change, now able to set the WhatsApp number to the same number in the same step.
-- (The two-argument version is dropped so a call with two arguments cannot be ambiguous; the edge function already deployed
-- calls it by name with two arguments and keeps working.)
drop function if exists public.seller_set_verified_phone(uuid, text);
create or replace function public.seller_set_verified_phone(p_business uuid, p_phone text, p_also_whatsapp boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_new text := public.normalize_phone_ke(p_phone);
  v_old text;
  v_wa text;
  v_cancelled integer;
  v_wa_changed boolean := false;
begin
  if v_new is null then return jsonb_build_object('ok', false, 'reason', 'invalid_phone'); end if;
  select b.phone, b.whatsapp into v_old, v_wa from public.businesses b where b.id = p_business and b.status <> 'deleted' for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_old is not distinct from v_new then return jsonb_build_object('ok', false, 'reason', 'no_change'); end if;

  v_wa_changed := coalesce(p_also_whatsapp, false) and v_wa is distinct from v_new;
  update public.businesses set phone = v_new, whatsapp = case when v_wa_changed then v_new else whatsapp end where id = p_business;
  update public.change_requests c set status = 'cancelled', decided_at = now()
   where c.business_id = p_business and c.field = 'phone' and c.status = 'pending';
  get diagnostics v_cancelled = row_count;
  return jsonb_build_object('ok', true, 'phone', v_new, 'previous', v_old, 'whatsappChanged', v_wa_changed, 'cancelledRequests', v_cancelled);
end $$;

-- The history of one business, newest first, for the admin site.
create or replace function public.admin_contact_history(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(array['reviewer', 'finance', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', h.id, 'field', h.field, 'old', h.old_value, 'new', h.new_value, 'at', h.changed_at,
      'byAdmin', a.user_id is not null, 'by', case when a.user_id is not null then coalesce(nullif(btrim(a.display_name), ''), a.email, 'an admin') end
    ) order by h.changed_at desc, h.id)
    from public.business_contact_history h
    left join public.admins a on a.user_id = h.changed_by
    where h.business_id = p_business
  ), '[]'::jsonb);
end $$;

-- Only the owner can remove an entry, and the removal is written to the audit log (with what was removed).
create or replace function public.admin_delete_contact_history(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare h public.business_contact_history;
begin
  if not public.has_role(array[]::text[]) then raise exception 'forbidden' using errcode = '42501'; end if; -- the owner only
  delete from public.business_contact_history where id = p_id returning * into h;
  if h.id is null then raise exception 'not_found'; end if;
  perform public.write_audit(h.business_id, 'contact_history_deleted', 'business_contact_history', h.id::text,
    jsonb_build_object('field', h.field, 'old', h.old_value, 'new', h.new_value, 'changedAt', h.changed_at));
  return true;
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['seller_set_verified_phone(uuid, text, boolean)', 'business_contact_history_log()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
  foreach fn in array array['admin_contact_history(uuid)', 'admin_delete_contact_history(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
