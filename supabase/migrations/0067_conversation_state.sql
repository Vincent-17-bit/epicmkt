-- 0067_conversation_state.sql
-- Admins can mark a seller conversation resolved and reopen it. A new seller message reopens it by itself.
--
--   * One row per resolved conversation (a conversation is one business, as on the Messages page). No row = open.
--   * Written only by admin_set_conversation_resolved(), which checks the role and writes the audit entry.
--   * The reopen on a seller message is a trigger and is not audited: there is no admin to name.
--
-- Additive and safe to re-run.
--
-- ROLLBACK (run by hand):
--   drop trigger if exists t_messages_reopen on public.messages;
--   drop function if exists public.messages_reopen();
--   drop function if exists public.admin_set_conversation_resolved(uuid, boolean);
--   drop table if exists public.admin_conversation_state;

create table if not exists public.admin_conversation_state (
  business_id uuid        primary key references public.businesses(id) on delete cascade,
  resolved_at timestamptz not null default now(),
  resolved_by uuid        references auth.users(id) on delete set null
);

alter table public.admin_conversation_state enable row level security;

drop policy if exists "admin reads conversation state" on public.admin_conversation_state;
create policy "admin reads conversation state" on public.admin_conversation_state
  for select to authenticated using (public.is_admin());

revoke all on public.admin_conversation_state from public, anon, authenticated;
grant select on public.admin_conversation_state to authenticated;
grant all on public.admin_conversation_state to service_role;

create or replace function public.admin_set_conversation_resolved(p_business uuid, p_resolved boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_was boolean;
begin
  if not public.has_role(array['reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_business is null or p_resolved is null then raise exception 'invalid_input'; end if;
  if not exists (
    select 1 from public.messages m
     where m.business_id = p_business and m.channel = 'in_app' and m.admin_hidden_at is null
  ) then raise exception 'conversation_not_found'; end if;

  select exists (select 1 from public.admin_conversation_state s where s.business_id = p_business) into v_was;
  if v_was = p_resolved then
    return jsonb_build_object('resolved', p_resolved, 'changed', false);
  end if;

  if p_resolved then
    insert into public.admin_conversation_state (business_id, resolved_at, resolved_by)
    values (p_business, now(), auth.uid())
    on conflict (business_id) do nothing;
  else
    delete from public.admin_conversation_state where business_id = p_business;
  end if;

  perform public.admin_audit_action(
    case when p_resolved then 'conversation.resolve' else 'conversation.reopen' end,
    'business', p_business::text,
    jsonb_build_object('resolved', v_was), jsonb_build_object('resolved', p_resolved),
    case when p_resolved then 'Conversation resolved' else 'Conversation reopened' end, p_business);
  return jsonb_build_object('resolved', p_resolved, 'changed', true);
end $$;
revoke all on function public.admin_set_conversation_resolved(uuid, boolean) from public, anon;
grant execute on function public.admin_set_conversation_resolved(uuid, boolean) to authenticated, service_role;

create or replace function public.messages_reopen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.sender = 'seller' and new.channel = 'in_app' and new.business_id is not null then
    delete from public.admin_conversation_state where business_id = new.business_id;
  end if;
  return new;
end $$;

drop trigger if exists t_messages_reopen on public.messages;
create trigger t_messages_reopen after insert on public.messages for each row execute function public.messages_reopen();
