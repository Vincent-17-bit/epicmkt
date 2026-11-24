import { realAdminDeps } from "../_shared/adminKit.ts";
import { adminOpenSeller } from "./handler.ts";

Deno.serve(adminOpenSeller(realAdminDeps()));
