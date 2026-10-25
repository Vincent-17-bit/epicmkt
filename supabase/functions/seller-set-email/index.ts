import { realDeps } from "../_shared/seller.ts";
import { sellerSetEmail } from "./handler.ts";

Deno.serve(sellerSetEmail(realDeps()));
