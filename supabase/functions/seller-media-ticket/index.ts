import { realDeps } from "../_shared/seller.ts";
import { sellerMediaTicket } from "./handler.ts";

Deno.serve(sellerMediaTicket(realDeps()));
