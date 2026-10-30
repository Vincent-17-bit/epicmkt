with a as (
  update public.applications
  set credit_kes = 1100,
      payment_code = 'DEMOCG99TZ',
      phone = '+254737826753'
  where reference_no = 'EPM-2026-CG99TZ'
    and status in ('submitted', 'under_review')
  returning id
)
insert into public.application_events (application_id, actor, type, data)
select id, 'admin', 'payment_submitted',
  jsonb_build_object('code', 'DEMOCG99TZ', 'amount', 1100, 'demo', true)
from a;

select reference_no, status, credit_kes, payment_code, phone
from public.applications
where reference_no = 'EPM-2026-CG99TZ';
