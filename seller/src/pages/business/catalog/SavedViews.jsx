import { useState } from "react";
import { MAX_SAVED_VIEWS, addSavedView } from "@epicmkt/shared";
import { errorText } from "../../../lib/errors.js";
import styles from "./catalog.module.css";

export default function SavedViews({ views, currentQuery, onApply, onSave }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const persist = async (next) => {
    setBusy(true);
    try {
      await onSave(next);
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const result = addSavedView(views, name, currentQuery);
    if (!result.ok) return setError(result.message);
    setError("");
    if (await persist(result.views)) {
      setName("");
      setNaming(false);
    }
  };

  return (
    <div className={styles.views}>
      <label className={styles.stackInline}>
        <span className={styles.sr}>Saved views</span>
        <select
          className={styles.select}
          aria-label="Saved views"
          value=""
          onChange={(e) => {
            const v = views.find((x) => x.id === e.target.value);
            if (v) onApply(v.query);
          }}
        >
          <option value="">{views.length ? "Saved views" : "No saved views"}</option>
          {views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </label>
      {!naming && (
        <button type="button" className={styles.ghost} onClick={() => { setNaming(true); setError(""); }} disabled={views.length >= MAX_SAVED_VIEWS} title={views.length >= MAX_SAVED_VIEWS ? "Delete a view to save a new one" : undefined}>
          Save this view
        </button>
      )}
      {naming && (
        <form className={styles.nameForm} onSubmit={submit}>
          <label className={styles.stackInline}>
            <span className={styles.sr}>View name</span>
            <input className={styles.text} value={name} onChange={(e) => setName(e.target.value)} placeholder="View name" aria-label="View name" maxLength={40} aria-invalid={Boolean(error)} autoFocus />
          </label>
          <button type="submit" className={styles.primary} disabled={busy}>Save</button>
          <button type="button" className={styles.ghost} onClick={() => { setNaming(false); setError(""); }}>Cancel</button>
        </form>
      )}
      {error && <p className={styles.err} role="alert">{error}</p>}
      {views.length > 0 && (
        <details className={styles.manage}>
          <summary>Manage views ({views.length} of {MAX_SAVED_VIEWS})</summary>
          <ul>
            {views.map((v) => (
              <li key={v.id}>
                <span>{v.name}</span>
                <button type="button" className={styles.ghost} onClick={() => persist(views.filter((x) => x.id !== v.id))} disabled={busy} aria-label={`Delete view ${v.name}`}>Delete</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
