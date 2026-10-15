import { usePermissions } from "../hooks/usePermissions.js";
import NoAccess from "../auth/NoAccess.jsx";

/** Renders the page only when the role may open it; otherwise the "no access" page, in the shell, with the reason. */
export default function RoleGuard({ permission, children }) {
  const { can, why } = usePermissions();
  if (!permission || can(permission)) return children;
  return <NoAccess variant="role" reason={why(permission)} />;
}
