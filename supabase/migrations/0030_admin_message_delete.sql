-- 0030_admin_message_delete.sql
-- Admins can remove one message or a whole conversation from the admin app. Sellers keep their own copy.

alter table public.messages add column if not exists admin_hidden_at timestamptz;
create index if not exists messages_admin_visible on public.messages (business_id, created_at desc) where admin_hidden_at is null;

create or replace function public.admin_unread_messages() returns integer
language sql stable security definer set search_path = public as
$$ select case when public.is_admin() then (select count(*)::integer from public.messages m where m.sender = 'seller' and m.channel = 'in_app' and m.admin_read_at is null and m.admin_hidden_at is null) else 0 end $$;
revoke all on function public.admin_unread_messages() from public, anon;
grant execute on function public.admin_unread_messages() to authenticated, service_role;

create or replace function public.admin_delete_message(p_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare v_msg public.messages;
begin
  if not public.has_role(array['reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_msg from public.messages where id = p_id and channel = 'in_app' and business_id is not null and admin_hidden_at is null;
  if not found then raise exception 'message_not_found'; end if;
  update public.messages set admin_hidden_at = now() where id = p_id;
  perform public.admin_audit_action('message.delete', 'message', p_id::text, null,
    jsonb_build_object('business_id', v_msg.business_id, 'sender', v_msg.sender), 'Message deleted', v_msg.business_id);
  return 1;
end $$;
revoke all on function public.admin_delete_message(uuid) from public, anon;
grant execute on function public.admin_delete_message(uuid) to authenticated, service_role;

create or replace function public.admin_delete_conversation(p_business uuid, p_thread uuid default null) returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if not public.has_role(array['reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_business is null then raise exception 'invalid_input'; end if;
  update public.messages set admin_hidden_at = now()
   where business_id = p_business and channel = 'in_app' and admin_hidden_at is null
     and (p_thread is null or thread_id = p_thread);
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'message_not_found'; end if;
  perform public.admin_audit_action('conversation.delete', 'business', p_business::text, null,
    jsonb_build_object('messages', v_n, 'thread_id', p_thread), case when p_thread is null then 'Conversation deleted' else 'Thread deleted' end, p_business);
  return v_n;
end $$;
revoke all on function public.admin_delete_conversation(uuid, uuid) from public, anon;
grant execute on function public.admin_delete_conversation(uuid, uuid) to authenticated, service_role;
