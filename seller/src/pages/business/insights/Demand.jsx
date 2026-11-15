import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { demandLine, demandSuggestion } from "@epicmkt/shared";
import * as api from "../../../api/index.js";
import { errorText } from "../../../lib/errors.js";
import ui from "../../../styles/ui.module.css";
import styles from "./demand.module.css";

const PERIODS = [{ days: 7, label: "Last 7 days" }, { days: 30, label: "Last 30 days" }];

/** What shoppers looked for on this shop's items and did not find (Samsung 512 GB, a colour you do not stock), with the option to add. */
export default function Demand() {
  const [period, setPeriod] = useState(7);
  const q = useQuery({ queryKey: ["unmet-demand", period], queryFn: () => api.getUnmetDemand(period), retry: false });
  const rows = q.data?.rows ?? [];

  return (
    <div className={ui.page}>
      <header className={ui.pageHead}>
        <h1>What shoppers want</h1>
        <p className={ui.muted}>When a shopper picks a combination you do not sell and taps “Let the seller know”, it is counted here. Nobody is named: you only see how many different shoppers asked.</p>
      </header>

      <div className={styles.periods} role="radiogroup" aria-label="Period">
        {PERIODS.map((p) => (
          <button key={p.days} type="button" role="radio" aria-checked={period === p.days} className={styles.period} onClick={() => setPeriod(p.days)}>{p.label}</button>
        ))}
      </div>

      {q.isPending && <p className={ui.muted} role="status">Loading…</p>}
      {q.isError && (
        <div className={ui.card} role="alert">
          <p>{errorText(q.error)}</p>
          <button type="button" className={ui.btn} onClick={() => q.refetch()}>Try again</button>
        </div>
      )}
      {q.data && rows.length === 0 && (
        <section className={ui.card} aria-live="polite">
          <h2>Nothing yet</h2>
          <p className={ui.muted}>No shopper has asked for something you do not sell in this period. When one does, it shows here with a suggestion.</p>
        </section>
      )}
      {rows.length > 0 && (
        <section className={ui.card} aria-labelledby="demand-list">
          <h2 id="demand-list">{q.data.total} {q.data.total === 1 ? "ask" : "asks"} in the {PERIODS.find((p) => p.days === period).label.toLowerCase()}</h2>
          <ul className={styles.list}>
            {rows.map((r) => (
              <li key={`${r.itemId}-${JSON.stringify(r.filters)}`} className={styles.row}>
                <div>
                  <p className={styles.line}><strong>{demandLine(r.count, r.filters)}</strong></p>
                  <p className={ui.muted}>On {r.itemName}</p>
                  <p className={styles.tip}>{demandSuggestion(r.filters, r.itemName)}</p>
                </div>
                <Link className={`${ui.btn} ${ui.btnGhost}`} to={`/business/catalog/${r.itemId}/edit`}>Add this option<span className={styles.sr}> to {r.itemName}</span></Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
