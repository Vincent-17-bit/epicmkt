-- Conversations between EpicMKT staff and sellers.
--
--   * Threaded in-app messages with attachments (PDF / JPEG / PNG / WebP) in both directions.
--   * Delivery and read receipts for both sides (single tick = sent, double tick = delivered, blue = read).
--   * Live admin bulk actions: message, suspend, unsuspend, strike, tag, feature, extend, export.
--   * A suspended seller can do nothing: every seller_* function and every direct write is refused.
--   * Subscription reminders go out 7, 3 and 2 days before expiry, on a daily schedule.
--
-- Receipt columns, by who sent the message:
--   sender 'admin' / 'system'  delivered_at, read_at                  = the seller's device received / opened it
--   sender 'seller'            admin_delivered_at, admin_read_at      = the admin app received / opened it
-- A seller's own message is stored as already read (read_at) so every existing "unread" count stays correct.

-- ---------------------------------------------------------------------------
-- Messages: sender, thread, receipts
-- ---------------------------------------------------------------------------
alter table public.messages
  add column if not exists sender text not null default 'system' check (sender in ('admin','seller','system')),
  add column if not exists thread_id uuid,
  add column if not exists parent_id uuid references public.messages(id) on delete set null,
  add column if not exists needs_reply boolean not null default false,
  add column if not exists delivered_at timestamptz,
  add column if not exists admin_delivered_at timestamptz,
  add column if not exists admin_read_at timestamptz;

update public.messages set thread_id = id where thread_id is null;

create or replace function public.messages_thread() returns trigger
language plpgsql as $$
begin
  if new.thread_id is null then
    if new.parent_id is null then
      new.thread_id := new.id;
    else
      select m.thread_id into new.thread_id from public.messages m where m.id = new.parent_id;
      new.thread_id := coalesce(new.thread_id, new.parent_id);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists t_messages_thread on public.messages;
create trigger t_messages_thread before insert on public.messages for each row execute function public.messages_thread();

create index if not exists messages_thread_idx on public.messages (thread_id, created_at);
create index if not exists messages_admin_unread_idx on public.messages (created_at desc) where sender = 'seller' and admin_read_at is null;

-- ---------------------------------------------------------------------------
-- Suspended sellers
-- ---------------------------------------------------------------------------
create or replace function public.my_business_suspended() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.businesses b where b.user_id = auth.uid() and b.status = 'suspended') $$;
revoke all on function public.my_business_suspended() from public, anon;
grant execute on function public.my_business_suspended() to authenticated, service_role;

create or replace function public.assert_seller_active() returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_business_suspended() then
    raise exception 'account_suspended' using errcode = 'P0001';
  end if;
end $$;
revoke all on function public.assert_seller_active() from public, anon;
grant execute on function public.assert_seller_active() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Attachments
-- ---------------------------------------------------------------------------
create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  path text not null check (char_length(path) between 3 and 260),
  original_name text not null check (char_length(original_name) between 1 and 200),
  mime text not null check (mime in ('application/pdf','image/jpeg','image/png','image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 8388608),
  uploaded_by text not null check (uploaded_by in ('admin','seller')),
  created_at timestamptz not null default now()
);
create index if not exists message_attachments_message_idx on public.message_attachments (message_id);
create index if not exists message_attachments_business_idx on public.message_attachments (business_id);
create index if not exists message_attachments_path_idx on public.message_attachments (path);

alter table public.message_attachments enable row level security;
drop policy if exists "seller reads own message attachments" on public.message_attachments;
create policy "seller reads own message attachments" on public.message_attachments for select to authenticated
  using (business_id = public.my_business_id());
drop policy if exists "admin all message attachments" on public.message_attachments;
create policy "admin all message attachments" on public.message_attachments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.message_attachments from public, anon, authenticated;
grant select on public.message_attachments to authenticated;
grant all on public.message_attachments to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('message-files', 'message-files', false, 8388608, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Files live under "<business id>/" when a seller sends them and under "admin/" when staff send them.
-- Staff upload once and attach the same file to many messages, so a seller may open any file that is
-- attached to one of their own messages.
drop policy if exists "seller uploads own message files" on storage.objects;
create policy "seller uploads own message files" on storage.objects for insert to authenticated
  with check (bucket_id = 'message-files' and (storage.foldername(name))[1] = public.my_business_id()::text);
drop policy if exists "seller opens message files" on storage.objects;
create policy "seller opens message files" on storage.objects for select to authenticated
  using (bucket_id = 'message-files' and exists (
    select 1 from public.message_attachments a where a.path = name and a.business_id = public.my_business_id()));
drop policy if exists "admin manages message files" on storage.objects;
create policy "admin manages message files" on storage.objects for all to authenticated
  using (bucket_id = 'message-files' and public.is_admin()) with check (bucket_id = 'message-files' and public.is_admin());

-- Direct table writes: a restrictive policy is ANDed with every existing policy.
do $$
declare t text;
begin
  foreach t in array array['items','item_media','faqs','offers','seller_settings','flash_sales'] loop
    execute format('drop policy if exists %I on public.%I', 'suspended cannot insert ' || t, t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (public.is_admin() or not public.my_business_suspended())', 'suspended cannot insert ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'suspended cannot update ' || t, t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (public.is_admin() or not public.my_business_suspended()) with check (public.is_admin() or not public.my_business_suspended())', 'suspended cannot update ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'suspended cannot delete ' || t, t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (public.is_admin() or not public.my_business_suspended())', 'suspended cannot delete ' || t, t);
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- Seller side
-- ---------------------------------------------------------------------------
create or replace function public.seller_mark_read(p_ids uuid[] default null) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_n integer;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  update public.messages m set read_at = now(), delivered_at = coalesce(m.delivered_at, now())
  where m.business_id = v_id and m.read_at is null and (p_ids is null or m.id = any (p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Checks a list of attachments sent by the browser. p_prefix is the folder the files must be in.
create or replace function public.message_check_attachments(p_att jsonb, p_prefix text) returns void
language plpgsql security definer set search_path = public as $$
declare a jsonb;
begin
  if p_att is null or jsonb_typeof(p_att) <> 'array' then raise exception 'invalid_attachments'; end if;
  if jsonb_array_length(p_att) > 5 then raise exception 'too_many_files'; end if;
  for a in select * from jsonb_array_elements(p_att) loop
    if left(coalesce(a ->> 'path', ''), char_length(p_prefix)) <> p_prefix
       or substr(a ->> 'path', char_length(p_prefix) + 1) !~ '^[A-Za-z0-9._-]{1,180}$' then
      raise exception 'invalid_attachment_path';
    end if;
    if coalesce(a ->> 'mime', '') not in ('application/pdf','image/jpeg','image/png','image/webp') then raise exception 'type_not_allowed'; end if;
    if coalesce((a ->> 'size')::integer, 0) not between 1 and 8388608 then raise exception 'file_too_large'; end if;
    if char_length(coalesce(a ->> 'name', '')) not between 1 and 200 then raise exception 'invalid_attachment_name'; end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'message-files' and o.name = a ->> 'path') then
      raise exception 'file_not_uploaded';
    end if;
  end loop;
end $$;
revoke all on function public.message_check_attachments(jsonb, text) from public, anon, authenticated;
grant execute on function public.message_check_attachments(jsonb, text) to service_role;

create or replace function public.message_add_attachments(p_message uuid, p_business uuid, p_att jsonb, p_by text) returns void
language plpgsql security definer set search_path = public as $$
declare a jsonb;
begin
  for a in select * from jsonb_array_elements(p_att) loop
    insert into public.message_attachments (message_id, business_id, path, original_name, mime, size_bytes, uploaded_by)
    values (p_message, p_business, a ->> 'path', left(a ->> 'name', 200), a ->> 'mime', (a ->> 'size')::integer, p_by);
  end loop;
end $$;
revoke all on function public.message_add_attachments(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.message_add_attachments(uuid, uuid, jsonb, text) to service_role;

-- A seller answers a message. Only conversations where staff asked for a reply accept answers.
-- Suspended sellers may still answer, so they can respond to the reason for the suspension.
create or replace function public.seller_send_message(p_parent uuid, p_body text, p_attachments jsonb default '[]') returns public.messages
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_att jsonb := coalesce(p_attachments, '[]'::jsonb);
  v_body text := btrim(coalesce(p_body, ''));
  v_parent public.messages;
  r public.messages;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into v_parent from public.messages m where m.id = p_parent and m.business_id = v_id and m.channel = 'in_app';
  if not found then raise exception 'message_not_found'; end if;
  if not exists (select 1 from public.messages m where m.thread_id = v_parent.thread_id and m.sender = 'admin' and m.needs_reply) then
    raise exception 'reply_not_allowed';
  end if;
  perform public.message_check_attachments(v_att, v_id::text || '/');
  if v_body = '' then
    if jsonb_array_length(v_att) = 0 then raise exception 'reply_too_short'; end if;
    v_body := 'Sent a file.';
  end if;
  if char_length(v_body) > 2000 then raise exception 'reply_too_long'; end if;
  -- The seller wrote it, so it counts as read and delivered on their side.
  insert into public.messages (business_id, channel, sender, kind, subject, body, parent_id, created_by, status, sent_at, read_at, delivered_at)
  values (v_id, 'in_app', 'seller', 'general', left('Re: ' || regexp_replace(coalesce(v_parent.subject, 'Message'), '^(Re: )+', ''), 150), v_body,
          p_parent, auth.uid(), 'sent', now(), now(), now())
  returning * into r;
  perform public.message_add_attachments(r.id, v_id, v_att, 'seller');
  perform public.notify_admin('seller_message', v_id, jsonb_build_object('message_id', r.id, 'thread_id', r.thread_id));
  return r;
end $$;
revoke all on function public.seller_send_message(uuid, text, jsonb) from public, anon;
grant execute on function public.seller_send_message(uuid, text, jsonb) to authenticated, service_role;

-- The device calls this when a message reaches it. Admin devices acknowledge seller messages; seller
-- devices acknowledge staff messages. Offline devices acknowledge the next time they open.
create or replace function public.message_ack_delivered(p_ids uuid[] default null) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_biz uuid;
  v_n integer;
begin
  if public.is_admin() then
    update public.messages m set admin_delivered_at = now()
    where m.sender = 'seller' and m.channel = 'in_app' and m.admin_delivered_at is null and (p_ids is null or m.id = any (p_ids));
  else
    v_biz := public.my_business_id();
    if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
    update public.messages m set delivered_at = now()
    where m.business_id = v_biz and m.channel = 'in_app' and m.sender in ('admin', 'system') and m.delivered_at is null and (p_ids is null or m.id = any (p_ids));
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.message_ack_delivered(uuid[]) from public, anon;
grant execute on function public.message_ack_delivered(uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Admin side
-- ---------------------------------------------------------------------------
create or replace function public.admin_mark_messages_read(p_business uuid default null, p_ids uuid[] default null) returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if not public.has_role(array['reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.messages m set admin_read_at = now(), admin_delivered_at = coalesce(m.admin_delivered_at, now())
  where m.sender = 'seller' and m.channel = 'in_app' and m.admin_read_at is null
    and (p_business is null or m.business_id = p_business) and (p_ids is null or m.id = any (p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.admin_mark_messages_read(uuid, uuid[]) from public, anon;
grant execute on function public.admin_mark_messages_read(uuid, uuid[]) to authenticated, service_role;

create or replace function public.admin_unread_messages() returns integer
language sql stable security definer set search_path = public as
$$ select case when public.is_admin() then (select count(*)::integer from public.messages m where m.sender = 'seller' and m.channel = 'in_app' and m.admin_read_at is null) else 0 end $$;
revoke all on function public.admin_unread_messages() from public, anon;
grant execute on function public.admin_unread_messages() to authenticated, service_role;

-- Sends an in-app message to one or more businesses. With p_parent it answers inside an existing thread.
create or replace function public.admin_send_message(
  p_business_ids uuid[], p_subject text, p_body text, p_needs_reply boolean default false,
  p_attachments jsonb default '[]', p_parent uuid default null, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[] := p_business_ids;
  v_att jsonb := coalesce(p_attachments, '[]'::jsonb);
  v_body text := btrim(coalesce(p_body, ''));
  v_subject text := nullif(btrim(coalesce(p_subject, '')), '');
  v_parent public.messages;
  v_biz uuid;
  v_msg public.messages;
  v_sent uuid[] := '{}';
  v_skipped integer := 0;
begin
  if not public.has_role(array['reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_parent is not null then
    select * into v_parent from public.messages m where m.id = p_parent and m.channel = 'in_app';
    if not found then raise exception 'message_not_found'; end if;
    v_ids := array[v_parent.business_id];
    v_subject := coalesce(v_subject, left('Re: ' || regexp_replace(coalesce(v_parent.subject, 'Message'), '^(Re: )+', ''), 150));
  end if;
  v_subject := coalesce(v_subject, 'Message from EpicMKT');
  if v_ids is null or cardinality(v_ids) = 0 then raise exception 'invalid_input'; end if;
  if cardinality(v_ids) > 500 then raise exception 'too_many_recipients'; end if;
  if char_length(v_subject) > 150 then raise exception 'invalid_subject'; end if;
  perform public.message_check_attachments(v_att, 'admin/');
  if v_body = '' then
    if jsonb_array_length(v_att) = 0 then raise exception 'body_required'; end if;
    v_body := 'Sent you a file.';
  end if;
  if char_length(v_body) > 4000 then raise exception 'body_too_long'; end if;

  foreach v_biz in array v_ids loop
    if not exists (select 1 from public.businesses b where b.id = v_biz and b.status <> 'deleted') then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    insert into public.messages (business_id, channel, sender, kind, subject, body, needs_reply, parent_id, created_by, status, sent_at)
    values (v_biz, 'in_app', 'admin', 'general', v_subject, v_body, coalesce(p_needs_reply, false), p_parent, auth.uid(), 'sent', now())
    returning * into v_msg;
    perform public.message_add_attachments(v_msg.id, v_biz, v_att, 'admin');
    perform public.admin_audit_action('message.send', 'business', v_biz::text, null,
      jsonb_build_object('message_id', v_msg.id, 'needs_reply', v_msg.needs_reply, 'files', jsonb_array_length(v_att)),
      coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Message sent'), v_biz);
    v_sent := v_sent || v_msg.id;
  end loop;
  return jsonb_build_object('sent', cardinality(v_sent), 'skipped', v_skipped, 'ids', to_jsonb(v_sent));
end $$;
revoke all on function public.admin_send_message(uuid[], text, text, boolean, jsonb, uuid, text) from public, anon;
grant execute on function public.admin_send_message(uuid[], text, text, boolean, jsonb, uuid, text) to authenticated, service_role;

-- The Businesses page bulk bar. Returns { affected, skipped, undoToken: null, auditId: null }.
create or replace function public.admin_bulk_business_action(p_action text, p_ids uuid[], p_reason text, p_params jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_params jsonb := coalesce(p_params, '{}'::jsonb);
  b public.businesses;
  v_affected integer := 0;
  v_total integer;
  v_channels jsonb;
  v_tag text;
  v_days integer;
  v_hit boolean;
begin
  if p_action = 'extend' then
    if not public.has_role(array['finance']) then raise exception 'forbidden' using errcode = '42501'; end if;
  elsif not public.has_role(array['reviewer', 'support']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'invalid_input'; end if;
  if cardinality(p_ids) > 500 then raise exception 'too_many_recipients'; end if;
  if char_length(v_reason) < 5 then raise exception 'reason_required'; end if;
  if p_action not in ('suspend', 'unsuspend', 'strike', 'tag', 'feature', 'extend', 'message', 'export') then raise exception 'not_supported'; end if;
  v_total := cardinality(p_ids);

  if p_action = 'tag' then
    v_tag := btrim(coalesce(v_params ->> 'tag', ''));
    if char_length(v_tag) not between 1 and 30 or coalesce(v_params ->> 'mode', '') not in ('add', 'remove') then raise exception 'invalid_input'; end if;
  elsif p_action = 'extend' then
    v_days := coalesce((v_params ->> 'days')::integer, 0);
    if v_days not between 1 and 365 then raise exception 'invalid_input'; end if;
  elsif p_action = 'feature' then
    if jsonb_typeof(v_params -> 'featured') <> 'boolean' then raise exception 'invalid_input'; end if;
  end if;

  if p_action = 'export' then
    select count(*) into v_affected from public.businesses x where x.id = any (p_ids);
    return jsonb_build_object('affected', v_affected, 'skipped', v_total - v_affected, 'undoToken', null, 'auditId', null);
  end if;

  if p_action = 'message' then
    v_channels := coalesce(v_params -> 'channels', '["inApp"]'::jsonb);
    if jsonb_typeof(v_channels) <> 'array' or jsonb_array_length(v_channels) = 0 then raise exception 'invalid_input'; end if;
    for b in select * from public.businesses x where x.id = any (p_ids) and x.status <> 'deleted' loop
      v_hit := false;
      if v_channels ? 'inApp' then
        perform public.admin_send_message(array[b.id], v_params ->> 'subject', v_params ->> 'body',
          coalesce((v_params ->> 'needsReply')::boolean, false), coalesce(v_params -> 'attachments', '[]'::jsonb), null, v_reason);
        v_hit := true;
      end if;
      if v_channels ? 'sms' and b.phone is not null then
        insert into public.messages (business_id, channel, sender, subject, body, to_address, status, created_by)
        values (b.id, 'sms', 'admin', null, left(btrim(coalesce(v_params ->> 'body', '')), 4000), b.phone, 'queued', auth.uid());
        v_hit := true;
      end if;
      if v_channels ? 'email' and b.email is not null then
        insert into public.messages (business_id, channel, sender, subject, body, to_address, status, created_by)
        values (b.id, 'email', 'admin', coalesce(nullif(btrim(coalesce(v_params ->> 'subject', '')), ''), 'Message from EpicMKT'),
                left(btrim(coalesce(v_params ->> 'body', '')), 4000), b.email, 'queued', auth.uid());
        v_hit := true;
      end if;
      if v_hit then v_affected := v_affected + 1; end if;
    end loop;
    return jsonb_build_object('affected', v_affected, 'skipped', v_total - v_affected, 'undoToken', null, 'auditId', null);
  end if;

  for b in select * from public.businesses x where x.id = any (p_ids) and x.status <> 'deleted' order by x.id for update loop
    if p_action = 'suspend' then
      continue when b.status = 'suspended';
      update public.businesses set status = 'suspended', status_reason = v_reason where id = b.id;
      perform public.post_seller_message(b.id, 'general', 'Your account has been suspended',
        'EpicMKT suspended your account. Reason: ' || v_reason || ' Your listing is hidden and your account is locked until EpicMKT lifts the suspension.', '{}');
    elsif p_action = 'unsuspend' then
      continue when b.status <> 'suspended';
      update public.businesses set status = 'live', status_reason = null where id = b.id;
      perform public.post_seller_message(b.id, 'general', 'Your account is active again', 'EpicMKT lifted the suspension on your account. Reason: ' || v_reason, '{}');
    elsif p_action = 'strike' then
      update public.businesses set strikes = strikes + 1 where id = b.id;
      perform public.post_seller_message(b.id, 'strike', 'You received a strike',
        v_reason || ' You now have ' || (b.strikes + 1) || ' strike' || case when b.strikes + 1 = 1 then '' else 's' end || '.',
        jsonb_build_object('strikes', b.strikes + 1));
    elsif p_action = 'tag' then
      if v_params ->> 'mode' = 'add' then
        continue when v_tag = any (b.tags);
        update public.businesses set tags = array_append(tags, v_tag) where id = b.id;
      else
        continue when not (v_tag = any (b.tags));
        update public.businesses set tags = array_remove(tags, v_tag) where id = b.id;
      end if;
    elsif p_action = 'feature' then
      continue when b.featured = (v_params ->> 'featured')::boolean;
      update public.businesses set featured = (v_params ->> 'featured')::boolean where id = b.id;
    elsif p_action = 'extend' then
      continue when b.paid_until is null;
      update public.businesses set paid_until = paid_until + make_interval(days => v_days) where id = b.id;
    end if;
    v_affected := v_affected + 1;
    perform public.admin_audit_action('business.' || p_action, 'business', b.id::text,
      jsonb_build_object('status', b.status, 'strikes', b.strikes, 'tags', to_jsonb(b.tags), 'featured', b.featured, 'paid_until', b.paid_until),
      v_params, v_reason, b.id);
  end loop;
  return jsonb_build_object('affected', v_affected, 'skipped', v_total - v_affected, 'undoToken', null, 'auditId', null);
end $$;
revoke all on function public.admin_bulk_business_action(text, uuid[], text, jsonb) from public, anon;
grant execute on function public.admin_bulk_business_action(text, uuid[], text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Subscription reminders: 7, 3 and 2 days before expiry (was 7, 3, 1)
-- ---------------------------------------------------------------------------
create or replace function public.generate_billing_notices(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = public as $$
declare
  b record;
  v_left integer;
  v_day text;
  v_n integer := 0;
  v_ok boolean;
begin
  for b in select x.id, x.paid_until from public.businesses x where x.paid_until is not null and x.status in ('live','paused','suspended','expired') loop
    v_left := public.nairobi_day(b.paid_until) - public.nairobi_day(p_now);
    v_day := to_char(public.nairobi_day(b.paid_until), 'YYYY-MM-DD');
    v_ok := false;
    if v_left in (7, 3, 2) then
      v_ok := public.post_seller_message(b.id, 'reminder', format('Your listing expires in %s days', v_left),
        format('Your subscription runs to %s. Renew before then to stay visible.', to_char(public.nairobi_day(b.paid_until), 'DD Mon YYYY')),
        jsonb_build_object('days_left', v_left), format('reminder:%s:%s', v_left, v_day));
    elsif v_left = 1 then
      v_ok := public.post_seller_message(b.id, 'reminder', 'Your listing expires tomorrow',
        format('Your subscription runs to %s. Renew before then to stay visible.', to_char(public.nairobi_day(b.paid_until), 'DD Mon YYYY')),
        jsonb_build_object('days_left', 1), format('reminder:1:%s', v_day));
    elsif v_left = -1 then
      v_ok := public.post_seller_message(b.id, 'grace', 'Your subscription has ended: 1 day of grace',
        'Your listing stays visible for one more day. Renew today to avoid being hidden.', '{}', 'grace:' || v_day);
    elsif v_left < -1 then
      v_ok := public.post_seller_message(b.id, 'expiry', 'Your subscription has expired',
        'Your listing is hidden from customers. Renew to bring it back.', '{}', 'expiry:' || v_day);
    end if;
    if v_ok then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;
revoke all on function public.generate_billing_notices(timestamptz) from public, anon, authenticated;
grant execute on function public.generate_billing_notices(timestamptz) to service_role;

-- Nothing ever called generate_billing_notices before this migration. Run it every morning (06:00 Nairobi).
-- Each notice has a de-duplication key, so a second run on the same day adds nothing.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.unschedule(jobid) from cron.job where jobname = 'billing-notices-daily';
      perform cron.schedule('billing-notices-daily', '0 3 * * *', 'select public.generate_billing_notices()');
    exception when others then
      raise notice 'billing-notices-daily was not scheduled: %', sqlerrm;
    end;
  else
    raise notice 'pg_cron is not available: schedule public.generate_billing_notices() once a day yourself';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Every seller_* function refuses a suspended seller, so they cannot edit the listing, items, hours,
-- flash sales, change requests and so on. Only four things stay open, so a suspended seller can
-- understand and answer the suspension: read notices, answer staff, and pay what they owe.
-- Rewrites each plpgsql function so its first statement is assert_seller_active(). Login one-time
-- codes (seller_otp_*) stay open too.
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
  def text;
  patched integer := 0;
begin
  for f in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname = 'public' and l.lanname = 'plpgsql'
      and p.proname like 'seller\_%' and p.proname not like 'seller\_otp\_%'
      and p.proname not in ('seller_mark_read', 'seller_reply_flag', 'seller_send_message', 'seller_payment_instructions',
                            'seller_quote_category_change', 'seller_submit_payment', 'seller_apply_credit', 'seller_set_payment_intent')
  loop
    def := pg_get_functiondef(f.oid);
    if position('assert_seller_active' in def) = 0 then
      if def !~ E'\nbegin\n' then
        raise exception 'cannot guard function %: no begin line', f.proname;
      end if;
      def := regexp_replace(def, E'\nbegin\n', E'\nbegin\n  perform public.assert_seller_active();\n', 'i');
      execute def;
      patched := patched + 1;
    end if;
  end loop;
  raise notice 'assert_seller_active added to % seller functions', patched;
end $$;

-- ---------------------------------------------------------------------------
-- Realtime (row-level security still applies to every subscriber)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_attachments') then
    alter publication supabase_realtime add table public.message_attachments;
  end if;
end $$;
