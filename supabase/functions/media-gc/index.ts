import { realDeps } from "../_shared/seller.ts";
import { mediaGc } from "./handler.ts";

Deno.serve(mediaGc(realDeps()));
