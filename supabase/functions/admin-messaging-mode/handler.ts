import { json, wrap } from "../_shared/seller.ts";
import { isResponse, requireRole, type OutboundDeps } from "../_shared/outbound.ts";
import { ADMIN_ROLES } from "../_shared/roles.ts";

// Tells the admin which messaging mode the edge functions are really running in, so the console can say so.
// The mode is an environment variable of the functions (MESSAGING_MODE, APP_ENV), which the database cannot see.
// 'live' sends real SMS and email; 'mock' sends nothing and records the rows as 'simulated'.
// Read-only and any admin may call it. It returns the mode only, never a secret.
export const adminMessagingMode = (d: Pick<OutboundDeps, "db" | "dev">) => wrap(async (req) => {
  const actor = await requireRole(req, d.db, [...ADMIN_ROLES]);
  if (isResponse(actor)) return actor;
  return json({ mode: d.dev ? "mock" : "live" });
});
