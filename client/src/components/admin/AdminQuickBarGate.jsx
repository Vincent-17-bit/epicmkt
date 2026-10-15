import { Suspense, lazy } from "react";
import { hasStoredSession } from "./storedSession.js";

// Ordinary visitors never download the admin chunk: it loads only when a Supabase session is stored in this browser.
const AdminQuickBar = lazy(() => import("./AdminQuickBar.jsx"));

export default function AdminQuickBarGate({ target }) {
  if (!target?.id || !hasStoredSession()) return null;
  return (
    <Suspense fallback={null}>
      <AdminQuickBar target={target} />
    </Suspense>
  );
}
