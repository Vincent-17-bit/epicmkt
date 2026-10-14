import { realAdminDeps } from "../_shared/adminKit.ts";
import { adminResetSellerPassword } from "./handler.ts";

Deno.serve(adminResetSellerPassword(realAdminDeps()));
