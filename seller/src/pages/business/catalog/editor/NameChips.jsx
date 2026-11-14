import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import * as api from "../../../../api/index.js";
import { duplicateOf, readName, rowFor } from "../../../../lib/nameParse.js";
import { ownValue, withRow } from "./typedRows.js";
import styles from "./editor.module.css";

export function NameChips({ name, rows, form, patch }) {
  const chips = useMemo(() => readName(name).map((c) => ({ ...c, row: rowFor(c, rows) })).filter((c) => c.row), [name, rows]);
  const open = chips.filter((c) => ownValue(form, c.row) === "");
  if (!open.length) return null;
  return (
    <div className={styles.span2} role="group" aria-label="Found in the name">
      <span className={styles.hint}>We found:</span>{" "}
      {open.map((c) => (
        <button key={`${c.scale}:${c.label}`} type="button" className={styles.btnGhost} aria-label={`Use ${c.label} for ${c.row.label}`} onClick={() => patch("specs", withRow(form, c.row, c.label))}>
          {c.label}
        </button>
      ))}
    </div>
  );
}

export function DuplicateGuard({ name }) {
  const [dismissed, setDismissed] = useState("");
  const catalog = useQuery({ queryKey: ["catalog", "items"], queryFn: api.getCatalog });
  const hit = useMemo(() => (name.trim().length >= 3 ? duplicateOf(name, catalog.data?.items ?? []) : null), [name, catalog.data]);
  if (!hit || dismissed === name) return null;
  return (
    <div className={styles.span2} role="status">
      <p className={styles.hint}>You already sell {hit.name}. Add this as another option instead?</p>
      <Link className={styles.btnGhost} to={`/business/catalog/${hit.id}/edit`} state={{ step: "options" }}>Open {hit.name}</Link>{" "}
      <button type="button" className={styles.btnGhost} onClick={() => setDismissed(name)}>No, this is a different item</button>
    </div>
  );
}
