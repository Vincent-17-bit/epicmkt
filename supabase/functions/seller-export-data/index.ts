import { realDeps } from "../_shared/seller.ts";
import { sellerExportData } from "./handler.ts";

Deno.serve(sellerExportData(realDeps()));
