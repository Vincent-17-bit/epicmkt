import { realDeps } from "../_shared/seller.ts";
import { adminProofUrl } from "./handler.ts";

Deno.serve(adminProofUrl(realDeps()));
