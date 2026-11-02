import { useQuery } from "@tanstack/react-query";
import { AVAILABILITY_OPTIONS, formatDateTime, optionLabel } from "@epicmkt/shared";
import * as api from "../../../../api/index.js";
import { errorText } from "../../../../lib/errors.js";
import ui from "../../../../styles/ui.module.css";
import styles from "./panel.module.css";

const kes = (v) => (v === null || v === undefined ? "not set" : `KES ${Number(v).toLocaleString("en-KE")}`);
const stock = (v) => (v === null || v === undefined ? "not counted" : v);
const status = (v) => optionLabel(AVAILABILITY_OPTIONS, v) || v;

export const sentenceOf = (h) => {
  switch (h.field) {
    case "price": return `Price changed from ${kes(h.oldValue)} to ${kes(h.newValue)}.`;
    case "price_max": return `Top price changed from ${kes(h.oldValue)} to ${kes(h.newValue)}.`;
    case "sale_price": return h.newValue === null ? "Sale price removed." : `Sale price set to ${kes(h.newValue)}.`;
    case "stock_count": return `Stock changed from ${stock(h.oldValue)} to ${stock(h.newValue)}.`;
    case "availability": return `Status changed from ${status(h.oldValue)} to ${status(h.newValue)}.`;
    case "visible": return h.newValue === "true" ? "Shown to customers." : "Hidden from customers.";
    case "draft": return h.newValue === "false" ? "Published. No longer a draft." : "Moved back to draft.";
    case "hidden_by_admin": return h.newValue === "true" ? "Hidden by EpicMKT." : "EpicMKT showed it again.";
    case "removed_by_admin": return h.newValue === "true" ? "Removed by EpicMKT." : "EpicMKT restored it.";
    default: return "Changed.";
  }
};

const WHO = { seller: "You", admin: "EpicMKT", system: "Automatic" };

export default function History({ item }) {
  const rows = useQuery({ queryKey: ["item", item.id, "history"], queryFn: () => api.getItemHistory(item.id), placeholderData: (prev) => prev });
  if (rows.isPending) return <div className={styles.skeletonStack} aria-busy="true" data-testid="history-skeleton"><span className={styles.skeletonRow} /><span className={styles.skeletonRow} /><span className={styles.skeletonRow} /></div>;
  if (rows.isError && !rows.data) {
    return (
      <div className={`${ui.banner} ${ui.tone_danger}`} role="alert">
        <h2>We could not load the history</h2>
        <p>{errorText(rows.error)}</p>
        <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => rows.refetch()}>Try again</button>
      </div>
    );
  }
  const list = rows.data ?? [];
  return (
    <section className={styles.stack} aria-labelledby="panel-history">
      <h3 id="panel-history" className={styles.h3}>What changed</h3>
      {list.length === 0 && <p className={styles.note} data-testid="history-empty">Nothing has changed since this item was added. Price, stock and status changes will show here.</p>}
      <ol className={styles.history}>
        {list.map((h) => (
          <li key={h.id} className={styles.event}>
            <span>{sentenceOf(h)}</span>
            <span className={styles.muted}>{WHO[h.actor] ?? "Automatic"} · {formatDateTime(h.at)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
