import { realDeps } from "../_shared/seller.ts";
import { sellerMediaRemove } from "./handler.ts";

Deno.serve(sellerMediaRemove(realDeps()));
