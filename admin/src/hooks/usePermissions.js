import { useMemo } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { ROLE_LABELS, explain, roleCan } from "../auth/permissions.js";

/**
 *   const { can, why } = usePermissions();
 *   can("payments.confirm")   -> boolean
 *   why("payments.confirm")   -> "" when allowed, otherwise "Only Owners and Finance admins can ..."
 *
 * Hide what a role should not even know about; disable (and explain with `title={why(...)}`) what it can see
 * but not do. The database still refuses the call either way.
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
    }),
    [role],
  );
}
