import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFlag } from "@fortawesome/free-solid-svg-icons";
import { optionLabel, AVAILABILITY_OPTIONS } from "@epicmkt/shared";
import { customerUrl } from "./cardItem.js";
import styles from "./catalog.module.css";

export const ribbonOf = (item) => {
  if (item.visibility === "hidden_admin") {
    const what = item.removed ? "Removed by admin" : "Hidden by admin";
    return { tone: "danger", text: item.adminHideReason ? `${what}: ${item.adminHideReason}` : what };
  }
  if (item.visibility === "draft") return { tone: "muted", text: "Draft, not showing to customers" };
  if (item.visibility === "hidden_me") return { tone: "muted", text: "Hidden by you" };
  return null;
};

export function Signals({ item }) {
  return (
    <span className={styles.signals}>
      {item.openFlags > 0 && (
        <span className={styles.flag} role="img" aria-label={`Flagged, ${item.openFlags} open`} title={`Flagged, ${item.openFlags} open`}>
          <FontAwesomeIcon icon={faFlag} />
        </span>
      )}
      {item.reports > 0 && <span className={styles.reports}>{item.reports} {item.reports === 1 ? "report" : "reports"}</span>}
    </span>
  );
}

export function Chips({ item }) {
  return (
    <span className={styles.chips}>
      <span className={`${styles.chip} ${styles[`avail_${item.availability}`] ?? ""}`}>{optionLabel(AVAILABILITY_OPTIONS, item.availability)}</span>
      {item.availKeys.has("seasonal") && <span className={styles.chip}>Seasonal</span>}
      {item.availKeys.has("coming_soon") && <span className={styles.chip}>Coming soon</span>}
      {item.flags.stalePrice && <span className={`${styles.chip} ${styles.warn}`}>Price may be out of date</span>}
      {item.flags.lowStock && <span className={`${styles.chip} ${styles.warn}`}>Low stock: {item.stockCount} left</span>}
    </span>
  );
}

export function Ribbon({ item }) {
  const r = ribbonOf(item);
  if (!r) return null;
  return <span className={`${styles.ribbon} ${r.tone === "danger" ? styles.ribbonDanger : ""}`} data-testid={`ribbon-${item.id}`}>{r.text}</span>;
}

export function Actions({ item, shop, selected, onSelect, onEdit, onDuplicate, onToggle, onConfirm, onMove, canMove, isFirst, isLast, busy }) {
  const locked = item.removed;
  const adminHidden = item.visibility === "hidden_admin";
  const priced = ["fixed", "from", "range"].includes(item.priceType) && typeof item.price === "number";
  const showing = item.visibility === "showing";
  const canShow = item.visible && !item.draft ? "Hide" : "Show";
  return (
    <span className={styles.actions}>
      <label className={styles.pick}>
        <input type="checkbox" checked={selected} onChange={() => onSelect(item.id)} aria-label={`Select ${item.name}`} />
        <span aria-hidden="true">Select</span>
      </label>
      <button type="button" className={styles.mini} onClick={() => onEdit(item)} disabled={locked || busy}>Edit<span className={styles.sr}> {item.name}</span></button>
      <button type="button" className={styles.mini} onClick={() => onDuplicate(item)} disabled={locked || busy}>Duplicate<span className={styles.sr}> {item.name}</span></button>
      <button
        type="button"
        className={styles.mini}
        onClick={() => onToggle(item)}
        disabled={adminHidden || busy}
        title={adminHidden ? "Hidden by admin. You cannot change this." : undefined}
      >
        {canShow}<span className={styles.sr}> {item.name}</span>
      </button>
      {priced && <button type="button" className={styles.mini} onClick={() => onConfirm(item)} disabled={locked || busy}>Confirm price<span className={styles.sr}> for {item.name}</span></button>}
      {showing && shop.live ? (
        <a className={styles.mini} href={customerUrl(shop.slug, item.id)} target="_blank" rel="noreferrer">View as customer<span className={styles.sr}> {item.name}</span></a>
      ) : (
        <button type="button" className={styles.mini} disabled title="Only items showing to customers can be viewed">View as customer<span className={styles.sr}> {item.name}</span></button>
      )}
      {canMove && (
        <span className={styles.move}>
          <button type="button" className={styles.mini} onClick={() => onMove(item.id, -1)} disabled={isFirst || busy} aria-label={`Move ${item.name} up`}>Up</button>
          <button type="button" className={styles.mini} onClick={() => onMove(item.id, 1)} disabled={isLast || busy} aria-label={`Move ${item.name} down`}>Down</button>
        </span>
      )}
    </span>
  );
}
