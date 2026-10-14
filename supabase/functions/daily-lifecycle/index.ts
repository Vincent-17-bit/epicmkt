import { realOutboundDeps } from "../_shared/outbound.ts";
import { dailyLifecycle } from "./handler.ts";

Deno.serve(dailyLifecycle(realOutboundDeps()));
