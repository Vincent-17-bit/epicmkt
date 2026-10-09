import { realDeps } from "../_shared/seller.ts";
import { sellerMediaFinalize } from "./handler.ts";

Deno.serve(sellerMediaFinalize(realDeps()));
