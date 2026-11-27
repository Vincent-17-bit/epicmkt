-- 0162_seller_phone_suspended.sql
-- A suspended seller cannot change the phone number on their listing.
-- seller_set_verified_phone is called by an edge function as the service role, so there is no seller session for assert_seller_active()
-- to read. assert_seller_active(p_business) checks the named business instead, and seller_set_verified_phone calls it first.

create or replace function public.assert_seller_active(p_business uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.businesses b where b.id = p_business and b.status = 'suspended') then
    raise exception 'account_suspended' using errcode = 'P0001';
  end if;
end $$;
revoke all on function public.assert_seller_active(uuid) from public, anon, authenticated;
grant execute on function public.assert_seller_active(uuid) to service_role;

create or replace function public.seller_set_verified_phone(p_business uuid, p_phone text, p_also_whatsapp boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_new text := public.normalize_phone_ke(p_phone);
  v_old text;
  v_wa text;
  v_cancelled integer;
  v_wa_changed boolean := false;
begin
  perform public.assert_seller_active(p_business);
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
