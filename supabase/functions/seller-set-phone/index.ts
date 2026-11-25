import { realDeps } from "../_shared/seller.ts";
import { sellerSetPhone } from "./handler.ts";

Deno.serve(sellerSetPhone(realDeps()));
