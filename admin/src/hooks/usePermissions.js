import { useMemo } from "react";
import { useAuth } from "../auth/AuthProvider.jsx";
import { ROLE_LABELS, explain, roleCan } from "../auth/permissions.js";

/**
 *   const { can, why, check } = usePermissions();
 *   can("payments.confirm")     -> boolean
 *   why("payments.confirm")     -> "" when allowed, otherwise "Only Owners and Finance admins can ..."
 *   check("payments.confirm")   -> { allowed, reason }
 *
 * For buttons, prefer <ActionButton action="..."> and <Can action="...">, which already follow the rules below:
 * hide what a role should not even know about, disable (and explain) what it can see but not do.
 */
export function usePermissions() {
  const { admin } = useAuth();
  const role = admin?.role ?? null;
  return useMemo(
    () => ({
      role,
      roleLabel: ROLE_LABELS[role] ?? "No role",
      can: (action) => roleCan(role, action),
      why: (action) => explain(role, action),
      check: (action) => ({ allowed: roleCan(role, action), reason: explain(role, action) }),
    }),
    [role],
  );
}
