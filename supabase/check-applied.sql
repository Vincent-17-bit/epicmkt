-- check-applied.sql
-- Run this in the Supabase SQL editor of the LIVE project. It is read-only.
-- It answers: "is every migration really in this database?" Run all three parts and read the result column.
--
-- Part 1 only works if the project was migrated with the Supabase CLI. Parts 2 and 3 work however the SQL was applied,
-- because they look at the real objects instead of the bookkeeping table.

-- Part 1. What the CLI recorded. Expect versions 0001 .. 0031 and 0035 .. 0037; 0032, 0033 and 0034 never existed.
-- Danger sign: a row named 0024_public_exceptions, 0025_exception_overnight or 0026_public_item_videos. Those are the old
-- names of 0035-0037 and they clash with the admin migrations 0024-0026. See "Fixing the record" in supabase/README.md.
select version, name
from supabase_migrations.schema_migrations
order by version;

-- Part 2. Every function and table the apps call must exist. Any row with ok = false is a missing migration.
with wanted(kind, name) as (
  values
    ('function','admin_activity'),
    ('function','admin_bulk_business_action'),
    ('function','admin_business_filter_options'),
    ('function','admin_business_tab_counts'),
    ('function','admin_businesses_query'),
    ('function','admin_counts'),
    ('function','admin_delete_conversation'),
    ('function','admin_delete_message'),
    ('function','admin_end_flash_sale'),
    ('function','admin_get_settings'),
    ('function','admin_log_document_view'),
    ('function','admin_mark_messages_read'),
    ('function','admin_mpesa_assign'),
    ('function','admin_mpesa_dismiss_callback'),
    ('function','admin_mpesa_ignore'),
    ('function','admin_mpesa_reprocess'),
    ('function','admin_mpesa_search_targets'),
    ('function','admin_my_sessions'),
    ('function','admin_open_application'),
    ('function','admin_save_settings'),
    ('function','admin_search'),
    ('function','admin_send_message'),
    ('function','admin_unread_messages'),
    ('function','attach_item_media'),
    ('function','auth_clear'),
    ('function','auth_lock_remaining'),
    ('function','auth_record_failure'),
    ('function','claim_due_messages'),
    ('function','get_server_time'),
    ('function','hit_rate_limit'),
    ('function','message_ack_delivered'),
    ('function','message_segment'),
    ('function','mpesa_ingest'),
    ('function','mpesa_settle_activation'),
    ('function','mpesa_void_for_code'),
    ('function','proofs_due_for_purge'),
    ('function','queue_billing_notices'),
    ('function','record_message_result'),
    ('function','revoke_user_sessions'),
    ('function','seller_end_flash_sale'),
    ('function','seller_otp_issue'),
    ('function','seller_otp_verify'),
    ('table','admin_notifications'),
    ('table','admin_payment_queue'),
    ('table','admins'),
    ('table','application_documents'),
    ('table','application_events'),
    ('table','application_flags'),
    ('table','applications'),
    ('table','audit_log'),
    ('table','businesses'),
    ('table','categories'),
    ('table','change_requests'),
    ('table','faqs'),
    ('table','flag_attachments'),
    ('table','flags'),
    ('table','flash_sales'),
    ('table','global_limits'),
    ('table','item_media'),
    ('table','items'),
    ('table','legal_docs'),
    ('table','login_events'),
    ('table','message_attachments'),
    ('table','message_templates'),
    ('table','messages'),
    ('table','mpesa_callbacks'),
    ('table','otp_requests'),
    ('table','payments'),
    ('table','plans'),
    ('table','public_businesses'),
    ('table','public_flash_sales'),
    ('table','public_items'),
    ('table','site_settings'),
    ('table','status_sessions')
)
select w.kind, w.name,
       case w.kind
         when 'function' then exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = w.name)
         else exists (select 1 from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relname = w.name and c.relkind in ('r', 'v', 'm', 'p'))
       end as ok
from wanted w
order by ok, w.kind, w.name;

-- Part 3. One probe per recent migration, by what it changed. Every row must say true.
select probe, ok from (values
  ('0029 grace days on businesses',      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'businesses' and column_name = 'grace_days')),
  ('0029 business_is_visible uses grace', coalesce(pg_get_functiondef(to_regprocedure('public.business_is_visible(public.businesses)')) like '%grace_days%', false)),
  ('0030 admin_delete_message and admin_delete_conversation', (select count(*) = 2 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('admin_delete_message', 'admin_delete_conversation'))),
  ('0031 plans_reprice_applications',   to_regprocedure('public.plans_reprice_applications(text,text,integer)') is not null or exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'plans_reprice_applications')),
  ('0035 public_businesses.exceptions',   exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'public_businesses' and column_name = 'exceptions')),
  ('0035 public_exceptions()',            to_regprocedure('public.public_exceptions(jsonb)') is not null),
  ('0036 overnight exception intervals',  coalesce(pg_get_functiondef(to_regprocedure('public.exception_normalize(date,text,jsonb,text,date)')) not like '%interval_order%', false)),
  ('0037 public_items.video_paths',       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'public_items' and column_name = 'video_paths')),
  ('anon can read public_businesses',     coalesce(has_table_privilege('anon', to_regclass('public.public_businesses'), 'select'), false)),
  ('anon can read public_items',          coalesce(has_table_privilege('anon', to_regclass('public.public_items'), 'select'), false))
) as t(probe, ok)
order by ok, probe;
