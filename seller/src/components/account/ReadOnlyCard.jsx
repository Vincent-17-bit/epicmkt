import { PLAN_FEATURES } from "@epicmkt/shared";
import { Chip, Dl, fmtDay } from "./ui.jsx";

const STATUS = { live: ["ok", "Live"], pending: ["warn", "Pending"], paused: ["neutral", "Paused"], suspended: ["bad", "Suspended"], expired: ["bad", "Expired"] };

/** Things only our team can change. No Edit button. */
export default function ReadOnlyCard({ business }) {
  const [tone, label] = STATUS[business.status] ?? ["neutral", business.status];
  const url = `epicmkt.co.ke/s/${business.slug}`;
  return (
    <section className="sx-card" id="details-readonly" aria-labelledby="details-readonly-title">
      <header className="sx-card__head">
        <div>
          <h2 id="details-readonly-title">Your listing <Chip tone="neutral">Read only</Chip></h2>
          <p className="sx-muted">These are set by EpicMKT. Contact support if something looks wrong.</p>
        </div>
      </header>
      <div className="sx-card__body">
        <Dl rows={[
          ["Your page", <span key="u"><a href={`https://${url}`} target="_blank" rel="noreferrer">{url}</a> <span className="sx-hint">This link is permanent.</span></span>],
          ["Status", <Chip key="s" tone={tone}>{label}</Chip>],
          ["Plan", PLAN_FEATURES[business.plan_key]?.label ?? business.plan_key],
          ["Paid until", fmtDay(business.paid_until)],
          ["Verified", business.verification_level === "verified" ? <Chip key="v" tone="ok">Verified</Chip> : "Not verified"],
          ["Featured", business.featured ? <Chip key="f" tone="premium">Featured</Chip> : "No"],
          ["Seller ID", <code key="i">{business.seller_id}</code>],
        ]} />
      </div>
    </section>
  );
}
