import { realDeps } from "../_shared/seller.ts";
import { sellerForgotRequest } from "./handler.ts";

Deno.serve(sellerForgotRequest(realDeps()));
