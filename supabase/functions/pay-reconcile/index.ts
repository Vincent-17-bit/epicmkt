// Every 2 minutes (supabase/cron/schedule.sql, with the x-cron-secret header): finishes STK callbacks that were stored but not
// processed, asks Safaricom about prompts whose callback is late, expires prompts nobody answered. See _shared/stk.ts.
import { wrap } from "../_shared/seller.ts";
import { reconcileStk } from "../_shared/stk.ts";
import { realStkDeps } from "../_shared/stkDeps.ts";

Deno.serve(wrap(reconcileStk(realStkDeps())));
