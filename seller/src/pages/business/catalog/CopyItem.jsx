import { useState } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "../../../api/index.js";
import { errorText } from "../../../lib/errors.js";
import styles from "./AddItem.module.css";

export default function CopyItem({ items, from = "" }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(null);
  const [problem, setProblem] = useState("");
  const q = query.trim().toLowerCase();
  const shown = items.filter((i) => !i.removedByAdmin && (!q || i.name.toLowerCase().includes(q))).slice(0, 8);
  if (!items.length) return null;

  const copy = async (item) => {
    setBusy(item.id);
    setProblem("");
    try {
      const id = await api.duplicateItem(item.id);
      navigate(`/business/catalog/${id}/edit`, { state: { from, step: "basics", notice: { tone: "ok", text: "Copy added as a draft. Check the details, then publish when ready." } } });
    } catch (e) {
      setProblem(errorText(e, "We could not copy that item."));
      setBusy(null);
    }
  };

  return (
    <section className={styles.block} aria-labelledby="copy-item">
      <h2 id="copy-item" className={styles.heading}>Copy an existing item</h2>
      <label className={styles.field}>
        <span>Find an item to copy</span>
        <input type="search" className={styles.input} value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {problem ? <p role="alert" className={styles.problem}>{problem}</p> : null}
      <ul className={styles.list}>
        {shown.map((i) => (
          <li key={i.id} className={styles.entry}>
            <span className={styles.entryName}>{i.name}</span>
            <button type="button" className={styles.ghost} aria-label={`Copy ${i.name}`} disabled={busy !== null} onClick={() => copy(i)}>
              {busy === i.id ? "Copying" : "Copy"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
