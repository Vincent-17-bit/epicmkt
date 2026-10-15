import { realOutboundDeps } from "../_shared/outbound.ts";
import { adminExport } from "./handler.ts";

Deno.serve(adminExport(realOutboundDeps()));
