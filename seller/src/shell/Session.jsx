import { useEffect, useState } from "react";
import * as api from "../api/index.js";
import * as mock from "../api/mock.js";
import { supabase } from "../api/client.js";
import { Button, Field, TextInput } from "../ui/ui.jsx";

const live = import.meta.env?.VITE_API_MODE === "live";

// Keeps the portal behind a session. Mock mode signs in the demo seller so the app is usable without a backend;
// ?category=gyms (mock only) previews another category's template. The real sign-in screens belong to a later step.
export function SessionGate({ children }) {
  const [state, setState] = useState("checking");

  useEffect(() => {
    let on = true;
    (async () => {
      if (live) {
        const { data } = (await supabase?.auth.getSession()) ?? { data: {} };
        if (on) setState(data?.session ? "in" : "out");
      } else {
        const cat = new URLSearchParams(window.location.search).get("category");
        if (cat) mock.setMockCategory(cat);
        await api.login("ES100001", "Demo-Passw0rd");
        if (on) setState("in");
      }
    })().catch(() => on && setState("out"));
    return () => { on = false; };
  }, []);

  if (state === "checking") return <p style={{ padding: "2rem" }} role="status">Loading…</p>;
  if (state === "out") return <SignIn onDone={() => setState("in")} />;
  return children;
}

function SignIn({ onDone }) {
  const [sellerId, setSellerId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError("");
    try { await api.login(sellerId, password); onDone(); } catch (e) { setError(e.code === "locked" ? "Too many attempts. Wait a while and try again." : "Seller ID or password is incorrect."); } finally { setBusy(false); }
  };
  return (
    <main style={{ maxWidth: "24rem", margin: "4rem auto", padding: "0 1rem", display: "grid", gap: "1rem" }}>
      <h1>Seller sign in</h1>
      <Field label="Seller ID">{(p) => <TextInput {...p} value={sellerId} onChange={setSellerId} autoComplete="username" />}</Field>
      <Field label="Password" error={error}>{(p) => <input {...p} type="password" style={{ minHeight: 44, padding: "0 .75rem" }} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />}</Field>
      <Button variant="primary" onClick={submit} disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
    </main>
  );
}
