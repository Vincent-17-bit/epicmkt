import { useEffect, useRef } from "react";
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
  // Show "Loading" for the first load only. Layout reads the same query, and when that load failed it refetches on mount,
  // which flips the shared query back to loading. Without this the page unmounts and remounts forever on a failing request.
  const settled = useRef(false);
  if (!me.isLoading) settled.current = true;
  const signedOut = me.error && (["unauthorized", "not_a_seller"].includes(me.error.code) || /permission denied|jwt/i.test(me.error.message ?? ""));
  useEffect(() => {
    // A signed-out visitor is normal and goes to login. Anything else is a real failure worth finding in the console.
    if (me.error && !signedOut) console.error("Seller portal could not load the subscription", me.error);
  }, [me.error, signedOut]);
  if (me.isLoading && !settled.current) return <p role="status" style={{ padding: "var(--space-5)" }}>Loading</p>;
  if (signedOut) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
