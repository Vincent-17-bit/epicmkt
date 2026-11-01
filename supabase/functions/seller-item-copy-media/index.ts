import { realDeps } from "../_shared/seller.ts";
import { sellerItemCopyMedia } from "./handler.ts";

Deno.serve(sellerItemCopyMedia(realDeps()));
