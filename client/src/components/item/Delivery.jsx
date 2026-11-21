import { fetchRoadKm } from "../../lib/roadDistance.js";
import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faCircleExclamation, faCircleQuestion, faClock, faLocationDot, faStore, faTruck } from "@fortawesome/free-solid-svg-icons";
import { deliveryInfo, deliveryReach, itemDeliveryInfo } from "@epicmkt/shared";
import { t } from "../../i18n/index.js";
import { useGeoStore } from "../../stores/geo.js";
import styles from "./Delivery.module.css";

const fill = (key, values) => Object.entries(values).reduce((text, [k, v]) => text.replace(`{${k}}`, v), t(key));
const kes = (n) => Number(n).toLocaleString("en-KE", { maximumFractionDigits: 2 });
const km = (n) => (n < 10 ? String(Math.round(n * 10) / 10) : String(Math.round(n)));

export const directionsHref = (seller) =>
  Number.isFinite(Number(seller?.lat)) && Number.isFinite(Number(seller?.lng)) && seller.lat != null && seller.lng != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${seller.lat},${seller.lng}`
    : null;

/**
 * The "Delivery" row near the price. The item's own setting decides when the seller set one (migration 0138: its own fee, area and time,
 * or pickup only); otherwise the shop's (shared deliveryInfo). State is carried by words and an icon, never colour alone. The browser is
 * asked for a position only when the buyer taps "Use my location".
 */
export default function Delivery({ ctx }) {
  const seller = ctx?.seller;
  const geo = useGeoStore();
  const live = useRef(null);
  const [announce, setAnnounce] = useState("");
  const own = ctx?.item?.deliveryOverride ?? null;
  const info = seller ? itemDeliveryInfo(own, deliveryInfo(seller)) : null;
  // The distance is by road: a routing service when one is configured, otherwise the straight line times 1.3 (shared deliveryReach).
  const [roadKm, setRoadKm] = useState(null);
  useEffect(() => {
    setRoadKm(null);
    if (!seller || !geo.coords || !Number.isFinite(Number(seller.lat)) || !Number.isFinite(Number(seller.lng))) return undefined;
    let alive = true;
    fetchRoadKm({ lat: Number(seller.lat), lng: Number(seller.lng) }, geo.coords).then((km) => { if (alive && km !== null) setRoadKm(km); });
    return () => { alive = false; };
  }, [seller?.lat, seller?.lng, geo.coords?.lat, geo.coords?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  // The distance check uses the shop's radius; an item that is pickup only has nothing to check.
  const reach = seller && info?.offers ? deliveryReach(seller, geo.coords, { roadKm }) : { status: "none" };
  const status = reach?.status ?? "none";

  // Tell a screen reader when the answer changes after the buyer shares or changes a location (not on first render).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (status === "inside") setAnnounce(t("delivery.live.inside"));
    else if (status === "outside") setAnnounce(t("delivery.live.outside"));
  }, [status, geo.coords?.lat, geo.coords?.lng]);

  // No `delivery` object at all means this page has no delivery data (an old payload): show nothing rather than guess "No delivery",
  // unless the item has its own setting.
  if (!seller || !info || (!own && (!seller.delivery || typeof seller.delivery !== "object"))) return null;

  const shopArea = seller.area || seller.townName || seller.town || "";
  const href = directionsHref(seller);
  const pickupLine = shopArea ? fill("delivery.pickupAt", { shop: seller.name, area: shopArea }) : fill("delivery.pickupNoArea", { shop: seller.name });

  if (!info.offers) {
    return (
      <section className={styles.root} aria-label={t("delivery.heading")} data-state="none">
        <p className={styles.line}>
          <FontAwesomeIcon icon={faStore} className={styles.iconMuted} aria-hidden="true" />
          <span><strong>{own ? t("delivery.pickupOnly") : t("delivery.none")}</strong></span>
        </p>
        <p className={styles.sub}>{shopArea ? fill("delivery.pickup", { shop: seller.name, area: shopArea }) : fill("delivery.pickupNoArea", { shop: seller.name })}</p>
        {info.notes && <p className={styles.sub}>{info.notes}</p>}
        {href && <a className={styles.link} href={href} target="_blank" rel="noopener noreferrer">{t("delivery.directions")}<span className={styles.sr}> ({seller.name})</span></a>}
      </section>
    );
  }

  const feeText = info.fee === 0 ? t("delivery.free") : info.fee != null ? fill("delivery.fee", { fee: kes(info.fee) }) : t("delivery.available");
  const where = geo.source === "town" ? geo.town : geo.place;
  const fromTown = Boolean(where);
  const away = reach.distanceKm != null ? (fromTown ? fill("delivery.awayTown", { km: km(reach.distanceKm), town: where }) : fill("delivery.away", { km: km(reach.distanceKm) })) : null;
  const icon = status === "inside" ? faCircleCheck : status === "outside" ? faCircleExclamation : faCircleQuestion;
  const headline = status === "inside" ? t("delivery.inside") : status === "outside" ? t("delivery.outside") : info.radiusKm != null ? t("delivery.unknown") : null;

  return (
    <section className={styles.root} aria-label={t("delivery.heading")} data-state={status}>
      <p className={styles.line}>
        <FontAwesomeIcon icon={faTruck} className={styles.icon} aria-hidden="true" />
        <span><strong className={styles.headline}>{feeText}</strong></span>
      </p>
      <ul className={styles.facts}>
        {info.area && <li><FontAwesomeIcon icon={faLocationDot} className={styles.factIcon} aria-hidden="true" />{fill("delivery.to", { area: info.area })}</li>}
        {info.time && <li><FontAwesomeIcon icon={faClock} className={styles.factIcon} aria-hidden="true" />{fill("delivery.time", { time: info.time })}</li>}
        {info.radiusKm != null && <li>{fill("delivery.radius", { km: km(info.radiusKm) })}</li>}
        {info.minOrder != null && info.minOrder > 0 && <li>{fill("delivery.minOrder", { amount: kes(info.minOrder) })}</li>}
        {info.notes && <li>{info.notes}</li>}
      </ul>
      {info.pickup && (
        <p className={styles.pickup}>
          <FontAwesomeIcon icon={faStore} className={styles.iconMuted} aria-hidden="true" />
          <span>{pickupLine}</span>
          {href && <a className={styles.inlineLink} href={href} target="_blank" rel="noopener noreferrer">{t("delivery.directions")}<span className={styles.sr}> ({seller.name})</span></a>}
        </p>
      )}
      {headline && (
        <p className={styles.reach} data-status={status}>
          <FontAwesomeIcon icon={icon} className={styles.icon} aria-hidden="true" />
          <span>{headline}{away ? ` (${away})` : ""}</span>
        </p>
      )}
      {info.radiusKm != null && (
        <div className={styles.actions}>
          {status === "unknown" && !geo.coords && (
            <>
              <button type="button" className={styles.btn} onClick={() => geo.request()}>{t("delivery.useLocation")}</button>
              <button type="button" className={styles.btnQuiet} onClick={() => geo.request()}>{t("delivery.chooseTown")}</button>
            </>
          )}
          {geo.coords && <button type="button" className={styles.btnQuiet} onClick={() => geo.request()}>{t("delivery.changeLocation")}</button>}
        </div>
      )}
      <p ref={live} className={styles.sr} role="status" aria-live="polite">{announce}</p>
    </section>
  );
}
