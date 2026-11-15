import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { similarKey } from "@epicmkt/shared";
import * as api from "../api/index.js";
import styles from "./addHelpers.module.css";

/** The item this name is probably the same as, from the shop's own list. */
export const findSimilar = (name, items, ignoreId = null) => {
  const key = similarKey(name);
  if (!key) return null;
  return (items ?? []).find((i) => i.id !== ignoreId && similarKey(i.name) === key) ?? null;
};

/**
 * "You already sell Philips LED bulb 9W. Add this as another option instead?" Shown after the seller leaves the name box, never blocking:
 * "No, this is different" dismisses it for this name. `checked` is the name as it was when the box lost focus.
 */
export default function DuplicateGuard({ checked, itemId: given = null, from = "" }) {
  const { itemId: editing } = useParams();
  const itemId = given ?? editing ?? null;
  const catalog = useQuery({ queryKey: ["catalog", "items"], queryFn: api.getCatalog, staleTime: 60_000 });
  const [dismissed, setDismissed] = useState("");
  // Only for a new item: an item being edited is the one the shop already sells.
  const match = checked && dismissed !== checked && !editing ? findSimilar(checked, catalog.data?.items, itemId) : null;
  if (!match) return null;
  return (
    <div className={styles.guard} role="status" data-testid="duplicate-guard">
      <p>You already sell <strong>{match.name}</strong>. Add this as another option instead?</p>
      <div className={styles.row}>
        <Link className={`${styles.btn} ${styles.btnPrimary}`} to={`/business/catalog/${match.id}/edit`} state={{ from, step: "options" }}>Add as an option</Link>
        <button type="button" className={styles.btn} onClick={() => setDismissed(checked)}>No, this is different</button>
      </div>
    </div>
  );
}
