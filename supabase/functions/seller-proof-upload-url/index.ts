import { realDeps } from "../_shared/seller.ts";
import { sellerProofUploadUrl } from "./handler.ts";

Deno.serve(sellerProofUploadUrl(realDeps()));
