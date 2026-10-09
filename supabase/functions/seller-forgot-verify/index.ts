import { realDeps } from "../_shared/seller.ts";
import { sellerForgotVerify } from "./handler.ts";

Deno.serve(sellerForgotVerify(realDeps()));
