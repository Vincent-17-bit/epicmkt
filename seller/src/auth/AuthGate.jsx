import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useHoursQuery, KEYS } from "../pages/hours/queries.js";
import * as api from "../api/index.js";
import { Button } from "../components/ui/index.js";
import styles from "./AuthGate.module.css";

const NEEDS_LOGIN = new Set(["unauthorized", "not_found", "not_configured"]);

export default function AuthGate({ children }) {
  const query = useHoursQuery();
  const qc = useQueryClient();
  const [sellerId, setSellerId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (query.isPending) return <p className={styles.state} role="status">Loading your hours…</p>;

  if (!query.data && query.isError && NEEDS_LOGIN.has(query.error?.code)) {
    const submit = async (e) => {
      e.preventDefault();
      setBusy(true);
      setError("");
      try {
        await api.login(sellerId.trim(), password);
        await qc.invalidateQueries({ queryKey: KEYS.hours });
      } catch (err) {
        setError(err?.code === "locked" ? "Too many attempts. Try again later." : "Seller ID or password is incorrect.");
      } finally {
        setBusy(false);
      }
    };
    return (
      <form className={styles.form} onSubmit={submit} noValidate>
        <h1 className={styles.title}>Sign in</h1>
        <label className={styles.field}>
          <span>Seller ID</span>
          <input value={sellerId} onChange={(e) => setSellerId(e.target.value)} autoComplete="username" autoCapitalize="characters" required />
        </label>
        <label className={styles.field}>
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <Button type="submit" variant="primary" busy={busy} disabled={!sellerId || !password}>
          Sign in
        </Button>
      </form>
    );
  }

  if (!query.data && query.isError) {
    return (
      <div className={styles.state} role="alert">
        <p>We could not load your hours.</p>
        <Button onClick={() => query.refetch()}>Try again</Button>
      </div>
    );
  }

  return children;
}
