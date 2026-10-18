# Flash sales: runbook

## Order of operations
1. Apply `supabase/migrations/0013_flash_sales.sql` (`supabase db push`). Do this before deploying the client.
2. Set client build env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Production builds fail without them unless `VITE_ALLOW_MOCK_BUILD=true`.
3. Deploy the client, seller and admin apps.

If the table is missing, the client shows an error state, never mock data.

## Supabase actions
- Database > Extensions: enable `pg_cron`. Without it the migration only prints a notice; the view still hides expired sales, but status is not swept until the job exists.
- Database > Replication: confirm `flash_sales` is in the `supabase_realtime` publication. Without Realtime the client falls back to polling (30s).
- Confirm `global_limits` has `flashSalesPerMonth` and `flashSalesConcurrent` for standard and premium.

## Behaviour
- Live state comes from `public_flash_sales`, judged by the database clock.
- Clients sync an offset via `get_server_time()` at start and every 5 minutes.
- Cron `flash-sales-sweep` runs every minute and marks expired sales ended.
- Admin ends a sale with a reason (audited, seller notified).

## Tests
`npm run test:db`, `npm run test:shared`, `npm run test:client`, `npm test -w seller`.
