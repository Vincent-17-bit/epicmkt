import { realDeps } from "../_shared/seller.ts";
import { sellerProofFinalize } from "./handler.ts";

Deno.serve(sellerProofFinalize(realDeps()));
