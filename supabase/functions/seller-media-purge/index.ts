import { realDeps } from "../_shared/seller.ts";
import { sellerMediaPurge } from "./handler.ts";

Deno.serve(sellerMediaPurge(realDeps()));
