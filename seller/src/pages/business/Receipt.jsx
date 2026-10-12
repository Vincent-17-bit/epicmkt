import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { receiptModel } from "@epicmkt/shared/billing";
import * as api from "../../api/index.js";
import { ISSUER } from "../../lib/issuer.js";
import ui from "../../styles/ui.module.css";
import styles from "./receipt.module.css";

export default function Receipt() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ["receipt", id], queryFn: () => api.getReceipt(id), retry: false });
  if (q.isLoading) return <div className={ui.page}><p role="status">Loading</p></div>;
  if (q.error) {
    return (
      <div className={ui.page}>
        <p className={ui.error} role="alert">We could not find that receipt.</p>
        <Link className={ui.link} to="/business/subscription">Back to subscription</Link>
      </div>
    );
  }
  const r = receiptModel({ payment: q.data.payment, business: q.data.business, categoryName: q.data.categoryName, issuer: ISSUER });
  const rows = [
    ["Receipt number", r.receiptNo],
    ["Business", r.businessName],
    ["Seller ID", r.sellerId],
    ["Category", r.category],
    ["Plan", r.plan],
    ["For", r.purpose],
    ["Amount", r.amountText],
    ["M-Pesa code", r.mpesaCode],
    ["Paid on", r.paidAt],
    ["Period covered", r.period],
  ];
  return (
    <div className={ui.page}>
      <div className={`${styles.actions} ${ui.noPrint}`}>
        <Link className={ui.link} to="/business/subscription">Back to subscription</Link>
        <button type="button" className={ui.btn} onClick={() => window.print()}>Print receipt</button>
      </div>
      <article className={styles.sheet} aria-label="Payment receipt" data-testid="receipt">
        <header className={styles.head}>
          <div>
            <p className={styles.issuer} data-testid="receipt-issuer">{r.issuer.name}</p>
            <p className={styles.small}>{[r.issuer.website, r.issuer.email, r.issuer.phone].filter(Boolean).join(" · ")}</p>
            {r.issuer.address && <p className={styles.small}>{r.issuer.address}</p>}
            {r.issuer.pin && <p className={styles.small}>KRA PIN {r.issuer.pin}</p>}
          </div>
          <h1 className={styles.title}>Payment receipt</h1>
        </header>
        <dl className={styles.rows}>
          {rows.map(([k, v]) => v ? (
            <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
          ) : null)}
        </dl>
        <p className={styles.small}>This receipt confirms we received your payment. Keep it for your records.</p>
      </article>
    </div>
  );
}
