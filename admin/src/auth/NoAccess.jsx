import { Link } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import { useAuth } from "./AuthProvider.jsx";
import AuthShell from "./AuthShell.jsx";

/**
 *  variant "account": signed in, but this account is not an admin. Full page, with a way out.
 *  variant "role":    an admin opened a page their role may not use. Shown inside the shell, with the reason.
 */
export default function NoAccess({ variant = "account", reason }) {
  const { user, signOut } = useAuth();
  if (variant === "role") {
    return (
      <div className="page-shell">
        <section className="notice-card" role="alert">
          <Icon name="lock" className="notice-card__icon" />
          <h2>You do not have access to this page</h2>
          <p>{reason}</p>
          <p className="notice-card__hint">If you need it, ask an owner to change your role.</p>
          <Link className="button button--primary" to="/admin">Back to Command Center</Link>
        </section>
      </div>
    );
  }
  return (
    <AuthShell title="No access" lead={`${user?.email ?? "This account"} is signed in, but it is not an EpicMKT admin account.`}>
      <p className="auth-help">If you should have access, ask an owner to add you. You can also sign in with a different account.</p>
      <button type="button" className="button button--primary button--block" onClick={() => signOut()}>Sign out</button>
    </AuthShell>
  );
}
