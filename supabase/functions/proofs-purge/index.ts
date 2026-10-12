import { realDeps } from "../_shared/seller.ts";
import { proofsPurge } from "./handler.ts";

Deno.serve(proofsPurge(realDeps()));
