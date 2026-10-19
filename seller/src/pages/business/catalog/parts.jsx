import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsis, faFlag } from "@fortawesome/free-solid-svg-icons";
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

function Menu({ label, children }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return undefined;
    root.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
    const down = (e) => { if (!root.current?.contains(e.target)) setOpen(false); };
    const key = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const step = (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...root.current.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    const at = items.indexOf(document.activeElement);
    const next = e.key === "ArrowDown" ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <span className={styles.menuRoot} ref={root}>
      <button
        ref={trigger}
        type="button"
        className={`${styles.mini} ${styles.menuBtn}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
      >
        <FontAwesomeIcon icon={faEllipsis} />
      </button>
      {open && <span className={styles.menu} role="menu" onKeyDown={step}>{children(close)}</span>}
    </span>
  );
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
      <span className={styles.actionsEnd}>
        <button type="button" className={`${styles.mini} ${styles.primaryBtn}`} onClick={() => onEdit(item)} disabled={locked || busy}>Edit<span className={styles.sr}> {item.name}</span></button>
        <Menu label={`More actions for ${item.name}`}>
          {(close) => (
            <>
              <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { close(); onDuplicate(item); }} disabled={locked || busy}>Duplicate</button>
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={() => { close(); onToggle(item); }}
                disabled={adminHidden || busy}
                title={adminHidden ? "Hidden by admin. You cannot change this." : undefined}
              >
                {canShow}
              </button>
              {priced && <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { close(); onConfirm(item); }} disabled={locked || busy}>Confirm price</button>}
              {showing && shop.live ? (
                <a role="menuitem" className={styles.menuItem} href={customerUrl(shop.slug, item.id)} target="_blank" rel="noreferrer" onClick={close}>View as customer</a>
              ) : (
                <button type="button" role="menuitem" className={styles.menuItem} disabled title="Only items showing to customers can be viewed">View as customer</button>
              )}
              {canMove && (
                <>
                  <button type="button" role="menuitem" className={styles.menuItem} onClick={() => onMove(item.id, -1)} disabled={isFirst || busy} aria-label={`Move ${item.name} up`}>Move up</button>
                  <button type="button" role="menuitem" className={styles.menuItem} onClick={() => onMove(item.id, 1)} disabled={isLast || busy} aria-label={`Move ${item.name} down`}>Move down</button>
                </>
              )}
            </>
          )}
        </Menu>
      </span>
    </span>
  );
}
