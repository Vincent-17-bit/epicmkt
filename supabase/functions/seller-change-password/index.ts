import { realDeps } from "../_shared/seller.ts";
import { sellerChangePassword } from "./handler.ts";

Deno.serve(sellerChangePassword(realDeps()));
