import { realOutboundDeps } from "../_shared/outbound.ts";
import { adminMessage } from "./handler.ts";

Deno.serve(adminMessage(realOutboundDeps()));
