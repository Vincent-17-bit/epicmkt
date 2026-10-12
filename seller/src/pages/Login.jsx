import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import * as auth from "../api/index.js";
import { Button, Field, inputClass } from "../components/ui.jsx";
import Brand from "../components/Brand.jsx";
import styles from "./Login.module.css";

export default function Login() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [sellerId, setSellerId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await auth.login(sellerId.trim(), password);
      client.clear();
      navigate("/business/offers", { replace: true });
    } catch (err) {
      setError(err.code === "locked" ? "Too many tries. Wait a few minutes and try again." : "Seller ID or password is incorrect.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={submit} noValidate>
        <Brand className={styles.brand} />
        <h1 className={styles.title}>Sign in</h1>
        <Field label="Seller ID">{(p) => <input {...p} className={inputClass} value={sellerId} onChange={(e) => setSellerId(e.target.value)} autoComplete="username" autoCapitalize="characters" required />}</Field>
        <Field label="Password" error={error}>{(p) => <input {...p} className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />}</Field>
        <Button type="submit" variant="primary" disabled={busy || !sellerId || !password}>{busy ? "Signing in" : "Sign in"}</Button>
      </form>
    </main>
  );
}
