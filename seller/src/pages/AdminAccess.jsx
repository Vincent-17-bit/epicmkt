import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import * as api from "../api/index.js";
import { clearAdminAccess, parseAdminHash, setAdminAccess } from "../lib/adminAccess.js";
import ui from "../styles/ui.module.css";

// The one-time token can be used once, and React may run an effect twice in development. Keep the attempt by token so it is never sent twice.
const attempts = new Map();

export default function AdminAccess() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  // Read the token once, before anything removes it from the address bar: the effect below can run twice (React's development mode does).
  const [found] = useState(() => parseAdminHash(window.location.hash));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Take the token out of the address bar and the history straight away.
    window.history.replaceState(null, "", window.location.pathname);
    if (!found) { setFailed(true); return; }
    let run = attempts.get(found.tokenHash);
    if (!run) { run = api.adminAccess(found.tokenHash); attempts.set(found.tokenHash, run); }
    let alive = true;
    run.then(() => {
      qc.clear();
      setAdminAccess(found);
      if (alive) navigate("/business/catalog", { replace: true });
    }).catch(() => {
      clearAdminAccess();
      if (alive) setFailed(true);
    });
    return () => { alive = false; };
  }, [found, navigate, qc]);

  if (failed) {
    return (
      <main style={{ padding: "var(--space-5)", maxWidth: "32rem", margin: "0 auto" }}>
        <div className={`${ui.banner} ${ui.tone_danger}`} role="alert">
          <h2>This link no longer works</h2>
          <p>An admin link can be used once and then expires. Go back to the admin app and choose Open seller site again.</p>
        </div>
        <p><Link to="/login">Seller sign in</Link></p>
      </main>
    );
  }
  return <p role="status" style={{ padding: "var(--space-5)" }}>Opening the seller site…</p>;
}
