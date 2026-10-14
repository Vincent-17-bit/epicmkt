import { realAdminDeps } from "../_shared/adminKit.ts";
import { adminDecideApplication } from "./handler.ts";

Deno.serve(adminDecideApplication(realAdminDeps()));
