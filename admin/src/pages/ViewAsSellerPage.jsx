import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/index.js";
import { countdown } from "../lib/businesses.js";
import { errorMessage } from "../lib/errors.js";
import { fmtDate, fmtKes } from "../lib/peek.js";
import EmptyState from "../components/EmptyState.jsx";
import { CountdownRing } from "../components/Rings.jsx";
import { DAY_ORDER, dayHours } from "./business/format.js";

// What the seller sees on their own subscription screen, by listing state. Read-only wording for the admin.
const SELLER_COPY = {
  active: (d) => `Your listing is live until ${d}.`,
  grace: (d) => `Your paid month ended on ${d}. You have one day of grace: renew today to stay visible to customers.`,
  expired: (d) => `Your listing ended on ${d} and customers can no longer see it. Renew to bring it back.`,
  none: () => "Your listing is not active yet. Pay to go live.",
};

// Read-only preview of the seller's portal for one business. It only ever calls the detail reader: there is no form, no
// save button and no write call on this page, and the banner stays pinned so nobody mistakes it for the seller's session.
export default function ViewAsSellerPage() {
  const { id } = useParams();
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ["admin-business", id], queryFn: () => api.getBusinessDetail(id) });

  if (isLoading) return <div className="page-shell"><section className="panel" aria-busy="true"><span className="skeleton skeleton--title" /><span className="skeleton" /></section></div>;
  if (isError || !data) {
    return <div className="page-shell"><section className="panel"><p className="form-error" role="alert">{errorMessage(error)} <button type="button" className="link-button" onClick={() => refetch()}>Try again</button></p></section></div>;
  }

  const b = data.business;
  const c = countdown(b.paid_until);
  const paid = fmtDate(b.paid_until);

  return (
    <div className="page-shell view-as">
      <div className="view-as__banner" role="status">
        <strong>Viewing as seller · read only.</strong> This is what <em>{b.name}</em> sees. Nothing on this page can be changed, and the seller is not notified.
        <Link to={`/admin/businesses/${id}`} className="view-as__exit">Back to admin</Link>
      </div>

      <section className="panel" aria-label="Subscription">
        <div className="panel__header"><h3>Subscription</h3></div>
        <div className="detail-head__main">
          <CountdownRing paidUntil={b.paid_until} size={84} />
          <div>
            <p className="view-as__lead">{(SELLER_COPY[c.state] ?? SELLER_COPY.none)(paid)}</p>
            <p className="muted">{b.plan_key} plan · {fmtKes(b.monthly_price)} a month</p>
            <div className="view-as__fake"><button type="button" className="primary-button" disabled aria-disabled="true">Renew</button><span className="muted"> Disabled in preview</span></div>
          </div>
        </div>
      </section>

      <div className="two-col">
        <section className="panel" aria-label="Business profile">
          <div className="panel__header"><h3>Your business</h3></div>
          <dl className="fields">
            {[["Name", b.name], ["Tagline", b.tagline], ["Phone", b.phone], ["Email", b.email], ["Town", b.town]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || "—"}</dd></div>)}
          </dl>
          {b.description ? <p className="pre">{b.description}</p> : null}
        </section>
        <section className="panel" aria-label="Opening hours">
          <div className="panel__header"><h3>Opening hours</h3></div>
          {b.hours && Object.keys(b.hours).length
            ? <dl className="hours">{DAY_ORDER.map(([k, label]) => <div key={k}><dt>{label}</dt><dd>{dayHours(b.hours[k])}</dd></div>)}</dl>
            : <EmptyState title="No hours set" icon="🕘" />}
        </section>
      </div>

      <section className="panel" aria-label="Attention">
        <div className="panel__header"><h3>Needs your attention</h3></div>
        <ul className="feed">
          <li className="feed__row">{data.counts?.open_flags ?? 0} open flag{data.counts?.open_flags === 1 ? "" : "s"} from the EpicMKT team</li>
          <li className="feed__row">{data.counts?.pending_changes ?? 0} change request{data.counts?.pending_changes === 1 ? "" : "s"} waiting</li>
        </ul>
      </section>
    </div>
  );
}
