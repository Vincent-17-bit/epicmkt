import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { MAX_SAVED_VIEWS, addSavedView, removeSavedView } from "@epicmkt/shared";
import styles from "./listings.module.css";

export default function SavedViews({ views, currentParams, onApply, onSave }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (event) => {
    event.preventDefault();
    const result = addSavedView(views, name, currentParams);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBusy(true);
    try {
      await onSave(result.views);
      setName("");
      setError("");
    } catch {
      setError("Could not save this view. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    setBusy(true);
    try {
      await onSave(removeSavedView(views, id));
    } catch {
      setError("Could not remove this view. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.views}>
      {views.length === 0 ? (
        <p className={styles.muted}>No saved views yet.</p>
      ) : (
        <ul className={styles.viewList}>
          {views.map((v) => (
            <li key={v.id}>
              <button type="button" className={styles.viewBtn} onClick={() => onApply(v)}>{v.name}</button>
              <button type="button" className={styles.iconBtn} onClick={() => remove(v.id)} disabled={busy} aria-label={`Delete view ${v.name}`}>
                <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={save} className={styles.viewForm}>
        <label className={styles.field}>
          <span>Save current view as</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-invalid={error ? "true" : undefined} aria-describedby="view-error" disabled={views.length >= MAX_SAVED_VIEWS} />
        </label>
        <button type="submit" className={styles.primaryBtn} disabled={busy || views.length >= MAX_SAVED_VIEWS}>Save view</button>
      </form>
      <p id="view-error" className={styles.error} role="alert">{error}</p>
      <p className={styles.muted}>{views.length} of {MAX_SAVED_VIEWS} views saved.</p>
    </div>
  );
}
