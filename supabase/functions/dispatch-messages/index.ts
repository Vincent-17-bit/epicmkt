import { realOutboundDeps } from "../_shared/outbound.ts";
import { dispatchMessages } from "./handler.ts";

Deno.serve(dispatchMessages(realOutboundDeps()));
