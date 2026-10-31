import { realDeps } from "../_shared/seller.ts";
import { sellerSignoutOthers } from "./handler.ts";

Deno.serve(sellerSignoutOthers(realDeps()));
