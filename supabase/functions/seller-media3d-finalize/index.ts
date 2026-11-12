import { realDeps } from "../_shared/seller.ts";
import { sellerMedia3dFinalize } from "./handler.ts";

Deno.serve(sellerMedia3dFinalize(realDeps()));
