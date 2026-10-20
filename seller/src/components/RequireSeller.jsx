import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import * as api from "../api/index.js";

/**
 * Signed-in sellers only. It does NOT look at the listing status: a suspended, paused or expired seller
 * must still reach Subscription, Notifications and Questions.
 */
export default function RequireSeller() {
  const location = useLocation();
  const me = useQuery({ queryKey: ["subscription"], queryFn: api.getSubscription, retry: false });
  if (me.isLoading) return <p role="status" style={{ padding: "var(--space-5)" }}>Loading</p>;
  const signedOut = me.error && (["unauthorized", "not_a_seller"].includes(me.error.code) || /permission denied|jwt/i.test(me.error.message ?? ""));
  if (signedOut) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
