import { realDeps } from "../_shared/seller.ts";
import { sellerOtpRequest } from "./handler.ts";

Deno.serve(sellerOtpRequest(realDeps()));
