import { realDeps } from "../_shared/seller.ts";
import { sellerLogin } from "./handler.ts";

Deno.serve(sellerLogin(realDeps()));
