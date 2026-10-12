import { Link } from "react-router-dom";
import { billingBanners } from "@epicmkt/shared/billing";
import { now } from "../lib/clock.js";
import ui from "../styles/ui.module.css";

export default function Banners({ business, onAction }) {
  const list = billingBanners(business, now());
  if (!list.length) return null;
  return (
    <div role="region" aria-label="Subscription notices" className={ui.page} style={{ padding: 0, gap: "var(--space-3)" }}>
      {list.map((b) => (
        <section key={b.id} className={`${ui.banner} ${ui[`tone_${b.tone}`]}`} data-testid={`banner-${b.id}`} role={b.tone === "danger" ? "alert" : "status"}>
          <h2>{b.title}</h2>
          <p>{b.text}</p>
          {b.action && onAction && (
            <button type="button" className={`${ui.btn}`} style={{ justifySelf: "start", marginTop: "var(--space-2)" }} onClick={() => onAction(b.action)}>
              {b.action === "pay" ? "Pay now" : "Renew now"}
            </button>
          )}
        </section>
      ))}
    </div>
  );
}
