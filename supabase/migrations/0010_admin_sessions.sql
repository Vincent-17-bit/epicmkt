-- Step B1b: the admin "where you are signed in" list.
--
-- supabase-js cannot list a user's sessions, so this reads auth.sessions for the caller only. It is plpgsql (not sql)
-- so the function can be created on a database whose auth schema differs, and it returns nothing to a non-admin.
-- "Sign out other devices" is the client call auth.signOut({ scope: 'others' }); it needs no SQL.

create or replace function public.admin_my_sessions()
returns table (id uuid, created_at timestamptz, updated_at timestamptz, user_agent text, ip text)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    return;
  end if;
  return query
    select s.id, s.created_at, s.updated_at, s.user_agent, host(s.ip)
    from auth.sessions s
    where s.user_id = auth.uid()
      and (s.not_after is null or s.not_after > now())
    order by coalesce(s.updated_at, s.created_at) desc;
end $$;

revoke all on function public.admin_my_sessions() from public, anon;
grant execute on function public.admin_my_sessions() to authenticated, service_role;
