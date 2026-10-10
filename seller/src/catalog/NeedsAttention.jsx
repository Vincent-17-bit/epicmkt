import { useEffect, useMemo, useState } from "react";
import { attentionReasons } from "@epicmkt/shared";
import * as api from "../api/index.js";
import { Button } from "../ui/ui.jsx";
import { useToasts } from "../ui/toasts.js";
import styles from "./catalog.module.css";

export const attentionList = (rows, signals) =>
  rows
    .filter((r) => r.saved)
    .map((r) => ({ row: r, reasons: attentionReasons(r.item, { signals }) }))
    .filter((x) => x.reasons.length);

export function NeedsAttention({ catalog, onFix }) {
  const [signals, setSignals] = useState(new Map());
  const push = useToasts((s) => s.push);

  useEffect(() => {
    let live = true;
    api.itemSignals().then((list) => { if (live) setSignals(new Map(list.map((s) => [s.item_id, s]))); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const list = useMemo(() => attentionList(catalog.rows, signals), [catalog.rows, signals]);
  const stale = list.filter((x) => x.reasons.some((r) => r.code === "stale_price")).length;

  const confirm = async () => {
    try {
      await api.confirmPrices();
      await catalog.reload();
      push({ message: "Thanks. All your prices are marked as current.", ms: 5000 });
    } catch {
      push({ message: "Could not confirm prices. Try again.", tone: "error" });
    }
  };

  if (!list.length) {
    return (
      <div className={styles.empty}>
        <h3>Nothing needs your attention</h3>
        <p className={styles.muted}>Prices are set, nothing is out of stock and no items are hidden.</p>
      </div>
    );
  }
  return (
    <div>
      {stale > 0 && (
        <div className={styles.confirmBar}>
          <span>{stale} {stale === 1 ? "price has" : "prices have"} not been confirmed in a while.</span>
          <Button onClick={confirm}>Confirm all prices are current</Button>
        </div>
      )}
      <ul className={styles.attentionList}>
        {list.map(({ row, reasons }) => (
          <li key={row.id} className={styles.attentionItem}>
            <div>
              <strong>{row.item.name}</strong>
              <ul className={styles.reasons}>{reasons.map((r) => <li key={r.code}>{r.label}</li>)}</ul>
            </div>
            <Button onClick={() => onFix(row.id)} aria-label={`Fix ${row.item.name} in the table`}>Fix in table</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
