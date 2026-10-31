-- 0066_seller_set_location.sql
-- Sellers can now set and move their shop pin on the map themselves. Until now the pin was only captured on the
-- application form: seller_update_profile refuses lat/lng and sellers cannot write the columns directly.
--
-- seller_set_location(p_lat, p_lng, p_address) stores the pin and, when p_address is given, the landmark text.
-- The pin must sit inside the same box the application form accepts (lat -5 to 5.5, lng 33.5 to 42), so a mistyped or
-- far-off point never reaches the public map or the search ranking (businesses.geo is generated from lat/lng).
-- p_address null leaves the address as it is; an empty string clears it. At most 200 characters, like seller_update_profile.

create or replace function public.seller_set_location(p_lat double precision, p_lng double precision, p_address text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_biz uuid := public.my_business_id();
  v_row public.businesses;
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_lat is null or p_lng is null
     or p_lat <> p_lat or p_lng <> p_lng
     or p_lat not between -5 and 5.5 or p_lng not between 33.5 and 42 then
    raise exception 'invalid_location' using errcode = 'P0001';
  end if;
  if p_address is not null and char_length(p_address) > 200 then raise exception 'invalid_address' using errcode = 'P0001'; end if;

  perform 1 from public.businesses b where b.id = v_biz for update;
  update public.businesses b set
    lat = round(p_lat::numeric, 6)::double precision,
    lng = round(p_lng::numeric, 6)::double precision,
    address = case when p_address is null then b.address else nullif(btrim(p_address), '') end
  where b.id = v_biz
  returning * into v_row;

  perform public.write_audit(v_biz, 'location_updated', 'business', v_biz::text,
    jsonb_build_object('lat', v_row.lat, 'lng', v_row.lng));
  return jsonb_build_object('lat', v_row.lat, 'lng', v_row.lng, 'address', v_row.address);
end $$;

revoke all on function public.seller_set_location(double precision, double precision, text) from public, anon;
grant execute on function public.seller_set_location(double precision, double precision, text) to authenticated, service_role;
