import { statusLabel } from "../../lib/businesses.js";
import { fmtDate, fmtDateTime, fmtKes } from "./format.js";

const text = (v) => (v === null || v === undefined || v === "" ? "—" : String(v));

const VISIBILITY_TITLES = {
  visible: "Visible to customers", grace: "Visible, in the grace day", deleted: "Hidden: in the recycle bin", pending: "Hidden: not activated",
  suspended: "Hidden: suspended", paused: "Hidden: unlisted", expired: "Hidden: payment lapsed", unpaid: "Hidden: never paid",
};

// The one place an admin answers "why can't customers find this business?". The verdict and reason come from the
// database (business_is_visible), never recomputed here, so it cannot disagree with what customers actually see.
export function VisibilityCard({ visibility, status, deleted, listingState, paidUntil }) {
  const v = visibility ?? { visible: false, code: "unpaid", reason: "Unknown" };
  // Explanatory only: the verdict above comes from the database.
  const checks = [
    ["Listing is live", status === "live" && !deleted],
    ["Paid month or grace day is running", ["active", "grace"].includes(listingState)],
  ];
  return (
    <section className={`vis-card vis-card--${v.visible ? "yes" : "no"}`} aria-labelledby="vis-title">
      <h3 id="vis-title" className="vis-card__eyebrow">Customer visibility</h3>
      <p className="vis-card__verdict"><span aria-hidden="true">{v.visible ? "●" : "○"}</span> {VISIBILITY_TITLES[v.code] ?? (v.visible ? "Visible to customers" : "Hidden from customers")}</p>
      <p className="vis-card__reason">{v.reason}</p>
      <ul className="vis-card__checks">
        {checks.map(([label, ok]) => <li key={label} className={ok ? "is-ok" : "is-bad"}><span aria-hidden="true">{ok ? "✓" : "✕"}</span> {label}</li>)}
        {paidUntil ? <li className="is-info">Paid until {fmtDate(paidUntil)} (Nairobi time)</li> : null}
      </ul>
    </section>
  );
}

function Fields({ rows }) {
  return <dl className="fields">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

export default function OverviewTab({ detail, agentName }) {
  const b = detail.business;
  const c = detail.counts ?? {};
  return (
    <div className="overview">
      <VisibilityCard visibility={detail.visibility} status={b.status} deleted={Boolean(b.deleted_at)} listingState={detail.listing_state} paidUntil={b.paid_until} />

      <div className="stat-row" role="list">
        {[["Items", c.items], ["FAQs", c.faqs], ["Offers", c.offers], ["Open flags", c.open_flags], ["Open reports", c.open_reports], ["Unconfirmed payments", c.unconfirmed_payments], ["Pending changes", c.pending_changes]].map(([k, v]) => (
          <div key={k} className="stat" role="listitem"><span>{k}</span><strong>{v ?? "–"}</strong></div>
        ))}
      </div>

      <div className="two-col">
        <section><h4>Listing</h4>
          <Fields rows={[
            ["Status", statusLabel(b.status)], ["Reason", text(b.status_reason)], ["Plan", text(b.plan_key)], ["Category", text(b.category_name ?? b.category_id)],
            ["Monthly price", fmtKes(b.monthly_price)], ["Paid until", fmtDate(b.paid_until)], ["First paid", fmtDate(b.first_paid_at)],
            ["Verification", b.verification_level === "verified" ? "Verified" : "Not verified"], ["Featured", b.featured ? `Yes${b.featured_until ? ` until ${fmtDate(b.featured_until)}` : ""}${b.featured_rank ? `, rank ${b.featured_rank}` : ""}` : "No"],
            ["Strikes", text(b.strikes)], ["Tags", b.tags?.length ? b.tags.join(", ") : "—"], ["Assigned agent", agentName || "—"],
          ]} />
        </section>
        <section><h4>Contact and place</h4>
          <Fields rows={[
            ["Owner", text(b.owner_name)], ["Phone", text(b.phone)], ["WhatsApp", text(b.whatsapp)], ["Email", text(b.email)],
            ["Town", text(b.town)], ["County", text(b.county)], ["Address", text(b.address)], ["Delivery area", text(b.delivery_area)],
            ["Seller ID", text(b.seller_id)], ["Page", `/${b.slug}`],
            ["Last login", fmtDateTime(b.last_login_at)], ["Last edit", fmtDateTime(b.last_edit_at)], ["Created", fmtDate(b.created_at)],
          ]} />
        </section>
      </div>

      {b.tagline || b.description ? (
        <section><h4>Public profile</h4>
          {b.tagline ? <p><strong>{b.tagline}</strong></p> : null}
          {b.description ? <p className="pre">{b.description}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
