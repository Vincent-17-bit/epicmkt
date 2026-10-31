import { realOutboundDeps } from "../_shared/outbound.ts";
import { adminMessagingMode } from "./handler.ts";

Deno.serve(adminMessagingMode(realOutboundDeps()));
