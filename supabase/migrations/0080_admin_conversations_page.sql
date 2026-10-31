-- 0080_admin_conversations_page.sql
-- The admin Messages inbox used to load the newest 1000 messages across ALL businesses and group, search, filter and count
-- them in the browser. Older conversations dropped off, and the unread numbers (counted from those 1000 rows) disagreed with
-- the sidebar badge (admin_unread_messages(), counted over every message).
--
-- admin_conversations_page() does that work on the server, one page at a time, newest activity first, one row per business:
--   * p_filter  'all' | 'unread' | 'waiting' | 'resolved'   (same meaning as the tabs on the Messages page:
--               waiting = staff asked for a reply and the last word was staff's, and the conversation is not resolved)
--   * p_search  matches the business name, the seller ID, or any message subject or body (case-insensitive)
--   * `counts`  the size of each tab, scoped to the search (so the tab badges stay right whichever tab is open)
--   * `unread`  per row uses EXACTLY the predicate of admin_unread_messages() (a seller message, in-app, not read by an
--               admin, not hidden), and `unread_total` IS admin_unread_messages(), so the list and the badge cannot drift.
--   * `resolved` comes from admin_conversation_state (migration 0067).
-- A conversation's messages are then loaded for one business at a time.
--
-- Same rules as the other admin reads: any admin, security definer, read only, safe to run more than once.
create or replace function public.admin_conversations_page(
  p_limit integer default 30, p_offset integer default 0, p_filter text default 'all', p_search text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_filter text := coalesce(nullif(btrim(p_filter), ''), 'all');
  v_needle text := nullif(btrim(regexp_replace(coalesce(p_search, ''), '\s+', ' ', 'g')), '');
  v_pat text;
  v_counts jsonb;
  v_total bigint;
  v_rows jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_filter not in ('all', 'unread', 'waiting', 'resolved') then raise exception 'invalid_filter'; end if;
  -- LIKE pattern for the search, with the wildcard characters in what was typed taken literally.
  v_pat := case when v_needle is null then null
                else '%' || replace(replace(replace(lower(v_needle), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;

  with vis as (
    select m.* from public.messages m
     where m.channel = 'in_app' and m.business_id is not null and m.admin_hidden_at is null
  ), per_thread as (
    -- A thread "waits for a reply" when staff asked for one somewhere in it and the last word was staff's (as in groupThreads()).
    select v.business_id, coalesce(v.thread_id, v.id) as thread_id,
           bool_or(v.sender = 'admin' and v.needs_reply) as asked,
           (array_agg(v.sender order by v.created_at desc, v.id desc))[1] as last_sender
      from vis v group by 1, 2
  ), waiting as (
    select t.business_id, bool_or(t.asked and t.last_sender = 'admin') as waiting from per_thread t group by 1
  ), per_business as (
    select v.business_id, b.name as business_name, b.seller_id,
           max(v.created_at) as last_at,
           (array_agg(v.subject order by v.created_at desc, v.id desc))[1] as last_subject,
           count(*) as message_count,
           count(*) filter (where v.sender = 'seller' and v.admin_read_at is null) as unread
      from vis v join public.businesses b on b.id = v.business_id
     group by v.business_id, b.name, b.seller_id
  ), scoped as (
    select p.*, coalesce(w.waiting, false) as waiting,
           exists (select 1 from public.admin_conversation_state s where s.business_id = p.business_id) as resolved
      from per_business p left join waiting w on w.business_id = p.business_id
     where v_pat is null
        or lower(coalesce(p.business_name, '')) like v_pat escape '\'
        or lower(coalesce(p.seller_id, '')) like v_pat escape '\'
        or exists (select 1 from vis v where v.business_id = p.business_id
                    and (lower(coalesce(v.subject, '')) like v_pat escape '\' or lower(coalesce(v.body, '')) like v_pat escape '\'))
  ), shown as (
    select s.* from scoped s
     where case v_filter when 'unread' then s.unread > 0
                         when 'waiting' then s.waiting and not s.resolved
                         when 'resolved' then s.resolved
                         else true end
  )
  select
    jsonb_build_object('all', (select count(*) from scoped),
                       'unread', (select count(*) from scoped where unread > 0),
                       'waiting', (select count(*) from scoped where waiting and not resolved),
                       'resolved', (select count(*) from scoped where resolved)),
    (select count(*) from shown),
    coalesce((select jsonb_agg(to_jsonb(x) order by x.last_at desc, x.business_id) from (
      select business_id, business_name, seller_id, last_at, last_subject, message_count, unread, waiting, resolved
        from shown order by last_at desc, business_id
       limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) x), '[]'::jsonb)
  into v_counts, v_total, v_rows;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'counts', v_counts, 'unread_total', public.admin_unread_messages());
end $$;

revoke all on function public.admin_conversations_page(integer, integer, text, text) from public, anon;
grant execute on function public.admin_conversations_page(integer, integer, text, text) to authenticated, service_role;
