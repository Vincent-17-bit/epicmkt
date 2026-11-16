// POST /functions/v1/pay-stk-status  { requestId, token? }  Where a "Pay now" prompt stands. The page polls it every few
// seconds; when Safaricom's callback is late it asks Safaricom directly. Same login rules as pay-stk-start.
import { readJson, wrap } from "../_shared/seller.ts";
import { stkStatus } from "../_shared/stk.ts";
import { realStkDeps } from "../_shared/stkDeps.ts";

const status = stkStatus(realStkDeps());
Deno.serve(wrap(async (req) => status(req, await readJson(req))));
