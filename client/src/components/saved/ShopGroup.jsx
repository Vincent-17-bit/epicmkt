import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faLocationArrow, faPhone } from "@fortawesome/free-solid-svg-icons";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { directionsLink, formatDate, formatDistance, formatKes, formatTime, distanceKm, telLink, whatsappLink } from "@epicmkt/shared";
import { resizedUrl } from "@epicmkt/ui";
import { logContactEvent, logEvent } from "../../api/index.js";
import { listMessage } from "../../lib/itemView.js";
import { savedList } from "../../lib/savedList.js";
import { useSaved } from "../../stores/saved.js";
import { useGeoStore } from "../../stores/geo.js";
import { t } from "../../i18n/index.js";
import { external } from "../item/links.js";
import { fill, sendable } from "./model.js";
import SavedLine from "./SavedLine.jsx";
import styles from "./ShopGroup.module.css";

const FIRST = 4;

// "Sent today, 7:51 pm" or "Sent 25 Oct": in the viewer's zone, through the shared formatters (never toLocale...String with no zone).
const sentText = (at) => {
  const same = formatDate(at) === formatDate(Date.now());
  return same ? fill("saved.sentAt", { time: formatTime(at) }) : fill("saved.sentOn", { date: formatDate(at, { year: undefined }) });
};

// One shop's box: its head, its lines (the first four, then "Show N more"), its subtotal and the one button that sends the whole list.
export default function ShopGroup({ group, loading, goTo }) {
  const uid = useId();
  const [all, setAll] = useState(false);
  const exact = useGeoStore((s) => s.exact);
  const sentAt = useSaved((s) => s.sentAt[group.businessId] ?? 0);
  const { shop } = group;
  const shown = all ? group.lines : group.lines.slice(0, FIRST);
  const hidden = group.lines.length - shown.length;
  const lat = Number(shop?.lat);
  const lng = Number(shop?.lng);
  const hasPin = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  const km = exact && hasPin ? distanceKm(exact, { lat, lng }) : null;
  const lines = sendable(group);
  const whatsapp = shop?.whatsapp;
  const href = whatsapp && lines.length ? whatsappLink(whatsapp, listMessage({ business: shop, lines: lines.map((l) => ({ name: l.name, optionLabel: l.optionLabel, qty: l.qty, measure: l.mode === "measure", unitLabel: l.entry.snap?.measure?.unit ?? null, total: l.total, service: l.service, status: l.status })) })) : null;

  const onSend = () => {
    const services = lines.filter((l) => l.service).length;
    for (const l of lines) logContactEvent({ businessId: group.businessId, itemId: l.itemId ?? l.entry.itemId, type: "whatsapp" });
    logEvent("saved_send", { businessId: group.businessId, lines: lines.length, services });
    // Sending never removes anything: it only notes when this shop was last sent its list.
    savedList().markSent(group.businessId);
  };
  const onCall = () => logContactEvent({ businessId: group.businessId, itemId: lines[0]?.itemId ?? lines[0]?.entry.itemId, type: "call" });
  const closed = shop && !shop.isOpen;
  const status = shop ? (shop.isOpen ? t("saved.open") : shop.statusLine || t("saved.closed")) : "";
  const visit = (e) => {
    e.preventDefault();
    goTo(`/b/${encodeURIComponent(group.slug)}`);
  };

  return (
    <section className={styles.box} aria-labelledby={`${uid}-h`} data-testid="saved-shop">
      <header className={styles.head}>
        <span className={styles.logo} aria-hidden="true">
          {shop?.logo ? <img src={resizedUrl(shop.logo, 64)} width={32} height={32} alt="" loading="lazy" decoding="async" className={styles.logoImg} /> : group.name.slice(0, 1).toUpperCase()}
        </span>
        <div className={styles.who}>
          <h3 id={`${uid}-h`} className={styles.name}>
            {group.slug && !group.shopGone ? (
              <Link to={`/b/${group.slug}`} className={styles.nameLink} onClick={visit}>
                {group.name}
              </Link>
            ) : (
              group.name
            )}
            {shop?.verified && <FontAwesomeIcon icon={faCircleCheck} className={styles.verified} title="Verified" aria-label="Verified" />}
          </h3>
          {group.shopGone ? (
            <p className={styles.meta}>{t("saved.shopGone")}</p>
          ) : (
            <p className={styles.meta}>
              <span data-open={shop?.isOpen ? "true" : "false"}>{status}</span>
              {Number.isFinite(km) && ` · ${formatDistance(km)}`}
            </p>
          )}
        </div>
        <span className={styles.count}>{group.lines.length === 1 ? t("saved.itemOne") : fill("saved.itemMany", { n: String(group.lines.length) })}</span>
      </header>

      <ul className={styles.lines}>
        {shown.map((line) => (
          <SavedLine key={line.key} line={line} loading={loading} goTo={goTo} />
        ))}
      </ul>
      {(hidden > 0 || all) && group.lines.length > FIRST && (
        <button type="button" className={styles.more} onClick={() => setAll((v) => !v)} aria-expanded={all}>
          {all ? t("saved.showFewer") : fill("saved.showMore", { n: String(hidden) })}
        </button>
      )}

      <footer className={styles.foot}>
        {group.priced > 0 && <p className={styles.subtotal}>{fill("saved.subtotal", { total: formatKes(group.subtotal) })}</p>}
        <div className={styles.actions}>
          {href ? (
            <a href={href} {...external} className={styles.send} onClick={onSend} data-testid="saved-send">
              <FontAwesomeIcon icon={faWhatsapp} aria-hidden="true" />
              <span>{t("saved.send")}</span>
            </a>
          ) : shop?.phone && !group.shopGone ? (
            <a href={telLink(shop.phone)} className={styles.send} onClick={onCall}>
              <FontAwesomeIcon icon={faPhone} aria-hidden="true" />
              <span>{t("saved.call")}</span>
            </a>
          ) : null}
          {href && shop?.phone && (
            <a href={telLink(shop.phone)} className={styles.icon} aria-label={t("saved.call")} onClick={onCall}>
              <FontAwesomeIcon icon={faPhone} aria-hidden="true" />
            </a>
          )}
          {hasPin && !group.shopGone && (
            <a href={directionsLink(lat, lng)} {...external} className={styles.icon} aria-label={t("saved.directions")}>
              <FontAwesomeIcon icon={faLocationArrow} aria-hidden="true" />
            </a>
          )}
        </div>
        {closed && href && <p className={styles.note}>{t("saved.closedNote")}</p>}
        {sentAt > 0 && <p className={styles.note}>{sentText(sentAt)}</p>}
      </footer>
    </section>
  );
}
