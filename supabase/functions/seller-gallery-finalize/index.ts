import { realDeps } from "../_shared/seller.ts";
import { sellerGalleryFinalize } from "./handler.ts";

Deno.serve(sellerGalleryFinalize(realDeps()));
