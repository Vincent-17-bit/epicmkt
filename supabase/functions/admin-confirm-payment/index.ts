import { realAdminDeps } from "../_shared/adminKit.ts";
import { adminConfirmPayment } from "./handler.ts";

Deno.serve(adminConfirmPayment(realAdminDeps()));
