-- A seller who removes a photo should not have to wait for the cron job: the seller site asks seller-media-purge to delete that
-- seller's queued Cloudinary files right away. This is the same claim as media_gc_claim, limited to one business's own files
-- (every id starts with "<businessId>/"), so a seller can only ever trigger deletion of their own queue.

create or replace function public.media_gc_claim_for_business(p_business uuid, p_limit integer default 20) returns table (public_id text)
language plpgsql security definer set search_path = public as $$
begin
  delete from public.media_gc g
  where g.next_try_at <= now()
    and g.public_id like p_business::text || '/%'
    and (exists (select 1 from public.item_media m where m.path = g.public_id)
      or exists (select 1 from public.businesses b where b.logo_path = g.public_id or b.cover_path = g.public_id));
  return query
  update public.media_gc g set attempts = g.attempts + 1, next_try_at = now() + interval '10 minutes'
  where g.public_id in (
    select q.public_id from public.media_gc q
    where q.next_try_at <= now() and q.public_id like p_business::text || '/%'
    order by q.next_try_at, q.queued_at
    limit greatest(1, least(coalesce(p_limit, 20), 50))
    for update skip locked)
  returning g.public_id;
end $$;

revoke all on function public.media_gc_claim_for_business(uuid, integer) from public, anon, authenticated;
grant execute on function public.media_gc_claim_for_business(uuid, integer) to service_role;
