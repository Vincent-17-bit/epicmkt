import { realDeps } from "../_shared/seller.ts";
import { sellerMediaCopy } from "./handler.ts";

Deno.serve(sellerMediaCopy(realDeps()));
