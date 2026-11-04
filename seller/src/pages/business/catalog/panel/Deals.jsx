import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { flashPhase, flashPrice, formatKes, offerHeadline, offerLabel, offerPhase } from "@epicmkt/shared";
import { Deals as DealResults } from "../ItemInsights.jsx";
import * as api from "../../../../api/index.js";
import { errorText } from "../../../../lib/errors.js";
import { useServerNow } from "../../../../lib/useServerNow.js";
import ui from "../../../../styles/ui.module.css";
import styles from "./panel.module.css";
import { timeLeft } from "./timeLeft.js";

const PHASE = { live: "Live", scheduled: "Scheduled", paused: "Paused" };

export default function Deals({ item }) {
  const now = useServerNow();
  const sales = useQuery({ queryKey: ["flash-sales"], queryFn: api.listFlashSales });
  const offers = useQuery({ queryKey: ["offers"], queryFn: api.listOffers });
  if (sales.isPending || offers.isPending) {
    return <div className={styles.skeletonStack} aria-busy="true" data-testid="deals-skeleton"><span className={styles.skeletonRow} /><span className={styles.skeletonRow} /></div>;
  }
  if ((sales.isError && !sales.data) || (offers.isError && !offers.data)) {
    const failed = sales.isError ? sales : offers;
    return (
      <div className={`${ui.banner} ${ui.tone_danger}`} role="alert">
        <h2>We could not load the deals</h2>
        <p>{errorText(failed.error)}</p>
        <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => { sales.refetch(); offers.refetch(); }}>Try again</button>
      </div>
    );
  }
  const flash = (sales.data ?? []).filter((s) => s.itemId === item.id && ["live", "scheduled"].includes(flashPhase(s, now)));
  const mine = (offers.data ?? []).filter((o) => o.scope === "store" || o.items.some((e) => e.itemId === item.id)).filter((o) => ["live", "scheduled", "paused"].includes(offerPhase(o, now)));
  return (
    <section className={styles.stack} aria-labelledby="panel-deals">
      <h3 id="panel-deals" className={styles.h3}>Deals on this item</h3>
      {flash.length === 0 && mine.length === 0 && <p className={styles.note} data-testid="deals-empty">No flash sale or offer is running or scheduled for this item.</p>}

      {flash.length > 0 && (
        <ul className={styles.deals} aria-label="Flash sales">
          {flash.map((s) => {
            const phase = flashPhase(s, now);
            const sale = Number.isFinite(item.price) ? flashPrice(s.discountType, s.discountValue, item.price) : null;
            return (
              <li key={s.id} className={styles.deal}>
                <div className={styles.rowBetween}>
                  <strong>Flash sale{s.headline ? `: ${s.headline}` : ""}</strong>
                  <span className={styles.chip}>{PHASE[phase]}</span>
                </div>
                {sale !== null && <span>{formatKes(item.price)} down to {formatKes(sale)}</span>}
                <span className={styles.muted}>{phase === "scheduled" ? "Starts soon. " : ""}{timeLeft(s.endsAt, now)}</span>
              </li>
            );
          })}
        </ul>
      )}

      {mine.length > 0 && (
        <ul className={styles.deals} aria-label="Offers">
          {mine.map((o) => {
            const phase = offerPhase(o, now);
            return (
              <li key={o.id} className={styles.deal}>
                <div className={styles.rowBetween}>
                  <strong>{o.title || offerLabel(o)}</strong>
                  <span className={styles.chip}>{PHASE[phase]}</span>
                </div>
                <span>{offerHeadline(o)}{o.scope === "store" ? ". Applies to your whole shop." : ""}</span>
                <span className={styles.muted}>{timeLeft(o.endsAt, now)}</span>
              </li>
            );
          })}
        </ul>
      )}

      <div className={styles.links}>
        <Link className={ui.link} to={`/business/flash?item=${encodeURIComponent(item.id)}`}>Flash sales for this item</Link>
        <Link className={ui.link} to={`/business/offers?item=${encodeURIComponent(item.id)}`}>Offers for this item</Link>
      </div>

      <h3 className={styles.h3}>How past deals did</h3>
      <DealResults itemId={item.id} />
    </section>
  );
}
