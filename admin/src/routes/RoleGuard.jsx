import { usePermissions } from "../hooks/usePermissions.js";

/** Renders the page only when the role may open it; otherwise a "no access" panel, inside the shell, with the reason. */
export default function RoleGuard({ permission, children }) {
  const { can, why } = usePermissions();
  if (!permission || can(permission)) return children;
  return (
    <div className="page-shell">
      <section className="panel no-access" role="alert">
        <h3>You do not have access to this page</h3>
        <p>{why(permission)}</p>
        <p className="muted">Ask an owner if you need access.</p>
      </section>
    </div>
  );
}
