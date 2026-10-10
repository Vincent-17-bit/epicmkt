import { Link, Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { hasSession, logout } from "../api/index.js";
import { GuardProvider } from "../lib/guard.jsx";

export default function Shell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ["session"], queryFn: hasSession, staleTime: 0 });

  if (session.isPending) return <p className="sx-center" role="status">Loading…</p>;
  if (!session.data) return <Navigate to="/login" replace />;

  const signOut = async () => {
    await logout();
    qc.clear();
    navigate("/login", { replace: true });
  };

  return (
    <GuardProvider>
      <header className="sx-header">
        <Link to="/" className="sx-brand">EpicMKT <span>Seller</span></Link>
        <nav aria-label="Seller">
          <NavLink to="/business/account">My Account</NavLink>
        </nav>
        <button type="button" className="sx-btn sx-btn--quiet" onClick={signOut}>Sign out</button>
      </header>
      <Outlet />
    </GuardProvider>
  );
}
