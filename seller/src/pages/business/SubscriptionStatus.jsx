import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faCircleInfo, faCircleXmark, faClock } from "@fortawesome/free-solid-svg-icons";
import { billingBanners, dayOf, daysLeft, formatDay, formatPrice, planLabel } from "@epicmkt/shared/billing";
import ui from "../../styles/ui.module.css";
import styles from "./subscription.module.css";

const STATE_LABEL = { none: "Not paid yet", active: "Active", grace: "Grace period", expired: "Expired" };
const STATUS_LABEL = { pending: "Not live yet", live: "Live", paused: "Paused (unlisted)", suspended: "Suspended", expired: "Hidden until you renew", deleted: "Deleted" };
const ICON = { ok: faCircleCheck, warning: faClock, danger: faCircleXmark, info: faCircleInfo };

// Days in the month that ends on `paidUntil` (30 for 21 Oct to 21 Nov), for the "days left" bar.
function monthLength(paidUntil) {
  const [y, m, d] = dayOf(paidUntil).split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const start = new Date(Date.UTC(y, m - 2, Math.min(d, last)));
  return Math.round((Date.UTC(y, m - 1, d) - start.getTime()) / 86_400_000);
}

/**
 * Where the subscription stands, in one card: a headline that says what it means for the shop (and what to do), then the facts.
 * It replaces the separate "expiring / grace / expired" banner and the summary that repeated the same dates.
 */
export default function SubscriptionStatus({ business, view, price, now }) {
  const notice = billingBanners(business, now).find((b) => ["expiring", "grace", "expired", "first-payment"].includes(b.id));
  const left = daysLeft(business.paidUntil, now);
  const hidden = view.state === "expired";
  let tone = notice?.tone ?? "ok";
  let title = notice?.title;
  let text = notice?.text;
  if (!notice && view.state === "active") {
    title = `Active until ${formatDay(view.paidUntilDay)}`;
    text = `${left} day${left === 1 ? "" : "s"} left. Your shop is visible to customers.`;
  } else if (!notice && view.state === "none") {
    tone = "info";
    title = "Not paid yet";
    text = "Pay below to put your shop live.";
  }
  if (tone === "danger" && !hidden) tone = "warning";
  const listing = business.status === "live" && hidden ? STATUS_LABEL.expired : STATUS_LABEL[business.status] ?? business.status;
  const total = view.state === "active" ? monthLength(business.paidUntil) : 0;

  return (
    <section className={`${ui.card} ${styles.status}`} data-tone={tone} aria-labelledby="sum-title" data-testid="subscription-status">
      <div className={styles.statusHead}>
        <span className={styles.statusIcon} aria-hidden="true"><FontAwesomeIcon icon={ICON[tone] ?? faCircleInfo} /></span>
        <div className={styles.statusText} data-testid={notice ? `banner-${notice.id}` : "status-message"}>
          <h2 id="sum-title">{title}</h2>
          <p>{text}</p>
        </div>
        <span className={`${ui.pill} ${styles.statePill}`} data-testid="sum-state">{STATE_LABEL[view.state]}</span>
      </div>

      {view.state === "active" && total > 0 && left <= total && (
        <div className={styles.meter} role="img" aria-label={`${left} of ${total} days left this month`}>
          <span style={{ width: `${Math.max(3, Math.min(100, (left / total) * 100))}%` }} />
        </div>
      )}

      <dl className={styles.facts}>
        <div><dt>Plan</dt><dd data-testid="sum-plan">{planLabel(business.planKey)} · {business.categoryName}</dd></div>
        {price != null && <div><dt>Price</dt><dd data-testid="sum-price">{formatPrice(price)} / month</dd></div>}
        <div><dt>Listing</dt><dd data-testid="sum-status">{listing}</dd></div>
        <div><dt>Paid until</dt><dd data-testid="sum-paid-until">{business.paidUntil ? formatDay(business.paidUntil) : "Not paid yet"}</dd></div>
      </dl>
    </section>
  );
}
