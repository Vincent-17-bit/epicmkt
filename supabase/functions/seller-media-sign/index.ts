import { realDeps } from "../_shared/seller.ts";
import { sellerMediaSign } from "./handler.ts";

Deno.serve(sellerMediaSign(realDeps()));
