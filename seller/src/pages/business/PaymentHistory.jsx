import { Link } from "react-router-dom";
import { formatDateTime, formatDay, formatKes, PAYMENT_KIND_LABELS, PAYMENT_STATUS_LABELS } from "@epicmkt/shared/billing";
import ui from "../../styles/ui.module.css";
import styles from "./subscription.module.css";

const TONE = { submitted: "tone_warning", confirmed: "tone_ok", rejected: "tone_danger" };

/** A table on wide screens; the same rows become stacked cards under 40rem (see subscription.module.css). */
export default function PaymentHistory({ payments }) {
  return (
    <section className={ui.card} aria-labelledby="history-title">
      <h2 id="history-title">Payment history</h2>
      {payments.length === 0 ? (
        <p className={ui.muted}>No payments yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} data-testid="payment-history">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Amount</th>
                <th scope="col">M-Pesa code</th>
                <th scope="col">Period covered</th>
                <th scope="col">Status</th>
                <th scope="col">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} data-testid="payment-row">
                  <td data-label="Date">{formatDateTime(p.confirmedAt ?? p.submittedAt ?? p.createdAt)}<br /><span className={ui.muted}>{PAYMENT_KIND_LABELS[p.kind] ?? p.kind}</span></td>
                  <td data-label="Amount" className={styles.num}>{formatKes(p.amount)}</td>
                  <td data-label="M-Pesa code" className={`${styles.mono} ${styles.num}`}>{p.mpesaCode ?? ""}</td>
                  <td data-label="Period covered">{p.periodStart && p.periodEnd ? `${formatDay(p.periodStart)} to ${formatDay(p.periodEnd)}` : ""}</td>
                  <td data-label="Status"><span className={`${ui.pill} ${ui[TONE[p.status]]}`}>{PAYMENT_STATUS_LABELS[p.status] ?? p.status}</span>{p.status === "rejected" && p.declineReason ? <><br /><span className={ui.muted}>{p.declineReason}</span></> : null}</td>
                  <td data-label="Receipt">
                    {p.status === "confirmed" && p.receiptNo ? <Link className={ui.link} to={`/business/subscription/receipts/${p.id}`}>{p.receiptNo}</Link> : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
