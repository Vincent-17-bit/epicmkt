import { Link } from "react-router-dom";
import { ShopCard } from "@epicmkt/ui";
import { useSession } from "../../state/session.js";
import { businessReadiness } from "../../lib/readiness.js";
import { daysLeft, listingState } from "../../lib/listing.js";
import { todaySentences } from "../../lib/today.js";
import { PlanBadge, StatusChip } from "../../shell/Badges.jsx";
import { Card, Empty, Meter, Ring, Stepper, TodoList } from "./parts.jsx";
import styles from "./dashboard.module.css";

const date = new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeZone: "Africa/Nairobi" });

const toShop = (b) => ({
  id: b.seller_id,
  name: b.name,
  plan: b.plan_key,
  verified: b.verification_level === "verified",
  isOpen: true,
  rating: 0,
  reviewCount: 0,
  phone: b.phone,
  whatsapp: b.whatsapp,
  lat: b.lat,
  lng: b.lng,
  area: b.town,
  county: b.county,
  categoryName: b.category_name,
  tagline: b.tagline ?? "Add a tagline to tell customers what you do.",
  hue: 205
});

const headline = (state, left) => {
  if (state === "live") return left === 0 ? "Live. Expires today." : `Live. ${left} ${left === 1 ? "day" : "days"} left.`;
  if (state === "grace") return "Grace period. Expires today.";
  if (state === "expired") return "Hidden from customers.";
  if (state === "paused") return "Paused. Customers cannot see it.";
  if (state === "suspended") return "Suspended.";
  return "Not live yet.";
};

export default function Dashboard() {
  const me = useSession((s) => s.me);
  const { business, catalog, usage, limits, application, notifications, questions } = me;
  const premium = business.plan_key === "premium";
  const state = listingState(business);
  const left = daysLeft(business.paid_until);
  const ready = businessReadiness(business, { catalog, usage });
  const today = todaySentences({ catalog, notifications, questions, left, state });
  const hasItems = (catalog?.total ?? 0) > 0;
  const watch = [
    ["Out of stock", catalog?.out_of_stock ?? 0],
    ["Limited stock", catalog?.limited_stock ?? 0],
    ["Unavailable", catalog?.unavailable ?? 0]
  ];

  return (
    <div className={styles.grid} data-plan={business.plan_key}>
      <section className={`${styles.card} ${styles.span}`} aria-label="Listing status">
        <div className={styles.statusRow}>
          <div className={styles.badges}>
            <PlanBadge plan={business.plan_key} />
            <StatusChip state={state} />
          </div>
          <h1 className={styles.headline}>{headline(state, left)}</h1>
          {business.paid_until && <p className={styles.muted}>Paid until {date.format(new Date(business.paid_until))}</p>}
        </div>
        <Stepper stage={application.stage} outcome={application.outcome} />
      </section>

      <Card title="Listing health" id="health" className={styles.health}>
        <div className={styles.healthBody}>
          <Ring score={ready.score} />
          <div className={styles.todos}>
            <TodoList title="Blocking" tone="blocking" items={ready.blocking} emptyText="Nothing is blocking your listing." />
            <TodoList title="Recommended" tone="recommended" items={ready.recommended} emptyText="You have covered the recommended steps." />
          </div>
        </div>
      </Card>

      <Card title="Today" id="today">
        {today.length ? (
          <ul className={styles.today}>
            {today.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>Nothing needs your attention today.</p>
        )}
      </Card>

      <Card title="Your storefront" id="storefront">
        <div className={styles.shop}>
          <ShopCard business={toShop(business)} href="/" mode="preview" />
        </div>
      </Card>

      <Card title="Catalog" id="catalog" action={<Link to="/catalog" className={styles.more}>Open</Link>}>
        {hasItems ? (
          <dl className={styles.stats}>
            <div><dt>Items</dt><dd>{catalog.total}</dd></div>
            <div><dt>Visible</dt><dd>{catalog.visible}</dd></div>
            <div><dt>Hidden</dt><dd>{catalog.hidden}</dd></div>
            <div><dt>No photo</dt><dd>{catalog.without_photo}</dd></div>
          </dl>
        ) : (
          <Empty to="/catalog" cta="Add an item">Your catalog is empty. Items you add appear here.</Empty>
        )}
      </Card>

      <Card title="Stock watch" id="stock">
        {hasItems ? (
          <ul className={styles.watch}>
            {watch.map(([label, n]) => (
              <li key={label}><span>{label}</span><strong>{n}</strong></li>
            ))}
          </ul>
        ) : (
          <Empty>Stock alerts appear once you add items.</Empty>
        )}
      </Card>

      <Card title="Plan usage" id="usage">
        {usage && limits ? (
          <div className={styles.meters}>
            <Meter label="Items" used={catalog?.total ?? 0} limit={catalog?.items_limit ?? 0} />
            <Meter label="Gallery photos" used={usage.gallery} limit={limits.gallery} />
            <Meter label="FAQs" used={usage.faqs} limit={limits.faqs} />
            <Meter label="Active offers" used={usage.offers} limit={limits.offers} />
            {premium && <Meter label="Flash sales this month" used={usage.flash} limit={limits.flash} />}
          </div>
        ) : (
          <Empty>Usage shows here once you add gallery photos, FAQs and offers.</Empty>
        )}
      </Card>

      <Card title="Subscription" id="subscription" action={<Link to="/subscription" className={styles.more}>Manage</Link>}>
        <div className={styles.sub}>
          <PlanBadge plan={business.plan_key} />
          <p>{business.paid_until ? `${left !== null && left < 0 ? "Expired" : "Renews or expires"} ${date.format(new Date(business.paid_until))}` : "No payment on record yet."}</p>
          {!premium && <p className={styles.muted}>Premium adds more photos, offers, flash sales and a featured badge.</p>}
        </div>
      </Card>

      <Card title="Questions from EpicMKT" id="questions">
        {questions.length ? (
          <ul className={styles.list}>
            {questions.map((q) => (
              <li key={q.id}>{q.text}</li>
            ))}
          </ul>
        ) : (
          <Empty>No questions are waiting for you.</Empty>
        )}
      </Card>

      <Card title="Recent notifications" id="notes" action={<Link to="/notifications" className={styles.more}>All</Link>}>
        {notifications.length ? (
          <ul className={styles.list}>
            {notifications.slice(0, 3).map((n) => (
              <li key={n.id} data-unread={n.read ? undefined : "true"}>
                <strong>{n.title}</strong>
                <span className={styles.muted}>{date.format(new Date(n.created_at))}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No notifications yet.</Empty>
        )}
      </Card>

      {premium && (
        <Card title="Customer activity" id="activity">
          <Empty>Views, calls and WhatsApp taps will show here once tracking is switched on.</Empty>
        </Card>
      )}

      <Card title="Quick actions" id="actions" className={styles.span}>
        <div className={styles.actions}>
          <Link to="/catalog" className={styles.linkBtn}>Add item</Link>
          <Link to="/account" className={styles.linkBtn}>Edit profile</Link>
          <Link to="/offers" className={styles.linkBtn}>Create offer</Link>
          <Link to="/subscription" className={styles.linkBtn}>Subscription</Link>
        </div>
      </Card>
    </div>
  );
}
