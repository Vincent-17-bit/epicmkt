import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@epicmkt/ui";
import * as api from "../api/index.js";
import { useBusinessFacts, FACTS_KEY } from "../lib/useBusinessFacts.js";
import { showToast } from "../state/toast.js";
import Dialog from "../components/Dialog.jsx";
import { Row, Section } from "./controls.jsx";
import styles from "./settings.module.css";

export default function DataAccount() {
  const qc = useQueryClient();
  const facts = useBusinessFacts().data;
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: FACTS_KEY }), qc.invalidateQueries({ queryKey: ["subscription"] })]);
  const signOut = async () => { await api.logout(); qc.clear(); };
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  if (!facts) return null;
  const b = facts;
  const status = b.status;

  const download = async () => {
    setBusy(true);
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `epicmkt-export-${b.seller_id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast("Your data is downloading");
    } catch (err) {
      showToast(err?.code === "rate_limited" ? "You can download your data a few times an hour. Try again later." : "We could not prepare your data. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const pause = async (on) => {
    setBusy(true);
    try {
      await api.pauseListing(on);
      await refresh();
      showToast(on ? "Listing paused" : "Listing is live again");
    } catch {
      showToast("We could not change your listing. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section id="data" title="Data and account">
      <Row label="Download my data" hint="A JSON file with your listing, items, settings and history.">
        <Button variant="secondary" onClick={download} disabled={busy}>Download my data</Button>
      </Row>
      <Row label="Pause listing" hint={status === "paused" ? "Your listing is hidden from customers until you resume." : "Hides your listing from customers. Your items and settings stay as they are."}>
        {status === "paused" ? <Button onClick={() => pause(false)} disabled={busy}>Resume listing</Button> : <Button variant="secondary" onClick={() => pause(true)} disabled={busy || status !== "live"}>Pause listing</Button>}
      </Row>
      <Row label="Delete account" hint="Hides your listing and asks the team to delete your account. This cannot be undone from here.">
        <Button variant="secondary" onClick={() => setDel(true)}>Delete account</Button>
      </Row>
      <DeleteDialog open={del} onClose={() => setDel(false)} name={b.name} onDone={async () => { setDel(false); await signOut(); navigate("/login", { replace: true }); }} />
    </Section>
  );
}

function DeleteDialog({ open, onClose, name, onDone }) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const match = typed.trim().toLowerCase() === name.trim().toLowerCase();
  const go = async (e) => {
    e.preventDefault();
    if (!match) return;
    setBusy(true);
    setError(null);
    try {
      await api.requestDeletion(typed.trim());
      onDone();
    } catch (err) {
      setError(err.code === "name_mismatch" ? "That does not match your business name." : "We could not delete your account. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Delete your account?">
      <form onSubmit={go} className={styles.page} noValidate>
        <p className={styles.muted}>Your listing will be hidden right away and the team will delete your account. To confirm, type your business name: <strong>{name}</strong></p>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="delete-name">Business name</label>
          <input id="delete-name" className={styles.input} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" aria-invalid={error ? "true" : undefined} aria-describedby={error ? "delete-name-e" : undefined} />
          {error && <p id="delete-name-e" className={styles.error} role="alert">{error}</p>}
        </div>
        <div className={styles.actions}>
          <Button type="submit" disabled={!match || busy}>{busy ? "Deleting…" : "Delete my account"}</Button>
          <Button variant="secondary" onClick={onClose}>Keep my account</Button>
        </div>
      </form>
    </Dialog>
  );
}
