import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import IdleGuard from "./IdleGuard.jsx";

// Route guard. This is a convenience for the person using the app: the real protection is the
// database (row level security) and the edge functions, which check the admins row on every call.
export default function RequireAdmin() {
  const { status, errorMessage, retry, signOut, demo } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="admin-gate" role="status">
        <p>Checking your session…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="admin-gate" role="alert">
        <h1>We could not check your admin access</h1>
        <p>{errorMessage || "The server did not answer. Check your connection and try again."}</p>
        <div className="admin-gate__actions">
          <button type="button" className="primary-button" onClick={retry}>Try again</button>
          <button type="button" className="secondary-button" onClick={signOut}>Sign out</button>
        </div>
      </div>
    );
  }

  if (status !== "admin") {
    return <Navigate to="/admin/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  return (
    <>
      {demo ? null : <IdleGuard />}
      <Outlet />
    </>
  );
}
