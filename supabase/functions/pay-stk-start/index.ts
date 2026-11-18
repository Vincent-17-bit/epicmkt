// POST /functions/v1/pay-stk-start  "Pay now": sends the M-Pesa PIN prompt to the payer's phone.
//   Seller:    Authorization: Bearer <seller session>   { phone, months?, purpose?, targetPlan?, category?, changeId? }
//   Applicant: { token: <status session token>, phone, months? }
// The amount is worked out by the database (mpesa_stk_prepare). See _shared/stk.ts for the whole flow.
import { readJson, wrap } from "../_shared/seller.ts";
import { startStk } from "../_shared/stk.ts";
import { realStkDeps } from "../_shared/stkDeps.ts";

const start = startStk(realStkDeps());
Deno.serve(wrap(async (req) => start(req, await readJson(req))));
