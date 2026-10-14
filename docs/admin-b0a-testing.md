# Admin step B0a: how to test

Covers `supabase/migrations/0009_admin_extras.sql` and `supabase/tests/rls_checks.sql`.

1. Apply it with `supabase db push`. On a clean database it applies in one transaction, and a second run also succeeds.
2. Run `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_checks.sql` on a local or dev database. Expect the notice `RLS checks passed: 661 checks across 24 tables and 5 actors`.
3. The test tries select, insert, update and delete on every table as owner, reviewer, finance, support and a plain non-admin. For blocked attempts it re-reads the table afterwards to confirm nothing changed.
4. To confirm the test can fail, weaken one policy, for example `admin update coupons` to `is_admin()`. The test then fails and names the table and actor. This was checked on a scratch copy and it caught both weakened policies.
5. In the SQL editor, `select policyname from pg_policies where tablename = 'plans'` should list four `admin select/insert/update/delete` policies and no `admin all` or `admin role` ones.
6. As a support admin through the client, `update plans set price_kes = 1` should change 0 rows and an `insert` should fail with a row-level security error.
7. Anon should still be able to read active categories and plans.
8. Set your first admin's role with the SQL from `supabase/README.md` before testing as an owner.
