-- Photo hover zoom, one setting for the whole site: on or off, how strong (2, 2.5 or 3), and the lens colour (a named swatch).
-- Everyone may read it (the item page needs it); only admins may change it, and the change is audited.

insert into public.site_settings (key, value) values ('zoom', '{"enabled": true, "scale": 2, "lens": "sky"}'::jsonb)
on conflict (key) do nothing;

create or replace function public.zoom_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.site_settings where key = 'zoom'), '{"enabled": true, "scale": 2, "lens": "sky"}'::jsonb);
$$;

create or replace function public.admin_save_zoom_settings(p_settings jsonb, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
  v_next jsonb;
begin
  if not public.has_role(array[]::text[]) then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_settings) is distinct from 'object'
     or jsonb_typeof(p_settings -> 'enabled') is distinct from 'boolean'
     or (p_settings ->> 'scale') not in ('2', '2.5', '3')
     or (p_settings ->> 'lens') not in ('sky', 'royal', 'teal', 'indigo') then
    raise exception 'invalid_zoom_settings' using errcode = '22023';
  end if;
  v_before := public.zoom_settings();
  v_next := jsonb_build_object('enabled', (p_settings ->> 'enabled')::boolean, 'scale', (p_settings ->> 'scale')::numeric, 'lens', p_settings ->> 'lens');
  insert into public.site_settings (key, value) values ('zoom', v_next)
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform public.admin_audit_action('settings.update', 'settings', 'zoom', v_before, v_next, nullif(btrim(coalesce(p_reason, '')), ''));
  return v_next;
end $$;

revoke all on function public.zoom_settings() from public;
revoke all on function public.admin_save_zoom_settings(jsonb, text) from public, anon;
grant execute on function public.zoom_settings() to anon, authenticated, service_role;
grant execute on function public.admin_save_zoom_settings(jsonb, text) to authenticated, service_role;
