import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsis, faFlag } from "@fortawesome/free-solid-svg-icons";
import { optionLabel, AVAILABILITY_OPTIONS } from "@epicmkt/shared";
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
      <span className={`${styles.chip} ${styles[`avail_${item.soldOut ? "out_of_stock" : item.availability}`] ?? ""}`}>{item.soldOut ? "Out of stock" : optionLabel(AVAILABILITY_OPTIONS, item.availability)}</span>
      {item.availKeys.has("seasonal") && <span className={styles.chip}>Seasonal</span>}
      {item.availKeys.has("coming_soon") && <span className={styles.chip}>Coming soon</span>}
      {item.flags.stalePrice && <span className={`${styles.chip} ${styles.warn}`}>Price may be out of date</span>}
      {item.flags.lowStock && <span className={`${styles.chip} ${styles.warn}`}>{item.stockCount} left</span>}
    </span>
  );
}

export function Ribbon({ item }) {
  const r = ribbonOf(item);
  if (!r) return null;
  return <span className={`${styles.ribbon} ${r.tone === "danger" ? styles.ribbonDanger : ""}`} data-testid={`ribbon-${item.id}`}>{r.text}</span>;
}

const GAP = 4;
const EDGE = 8;

// Place the menu against the viewport (not its card) so it is never clipped:
// below the trigger when it fits, otherwise above, otherwise on the roomier
// side with its own scroll. Horizontally it is clamped inside the screen.
function placeMenu(triggerEl, menuEl) {
  const t = triggerEl.getBoundingClientRect();
  const vv = window.visualViewport;
  const vw = vv?.width ?? window.innerWidth;
  const vh = vv?.height ?? window.innerHeight;
  const offX = vv?.offsetLeft ?? 0;
  const offY = vv?.offsetTop ?? 0;

  const width = Math.min(menuEl.offsetWidth, vw - EDGE * 2);
  const natural = menuEl.scrollHeight;
  const below = vh - (t.bottom - offY) - GAP - EDGE;
  const above = (t.top - offY) - GAP - EDGE;

  const openDown = natural <= below || below >= above;
  const room = openDown ? below : above;
  const height = Math.min(natural, Math.max(room, 0));

  const top = openDown ? t.bottom + GAP : t.top - GAP - height;
  const left = Math.min(Math.max(t.right - width, offX + EDGE), offX + vw - EDGE - width);

  return { top, left, maxHeight: Math.max(room, 0) };
}

function Menu({ label, children }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const root = useRef(null);
  const trigger = useRef(null);
  const panel = useRef(null);
  const close = () => setOpen(false);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }
    const update = () => {
      if (trigger.current && panel.current) setPos(placeMenu(trigger.current, panel.current));
    };
    update();
    const onScroll = (e) => { if (!panel.current?.contains(e.target)) setOpen(false); };
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    root.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
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
      {open && (
        <span
          ref={panel}
          className={styles.menu}
          role="menu"
          onKeyDown={step}
          style={pos ? { top: pos.top, left: pos.left, maxHeight: pos.maxHeight } : { visibility: "hidden" }}
        >
          {children(close)}
        </span>
      )}
    </span>
  );
}

export function Actions({ item, selected, onSelect, onEdit, onDuplicate, onToggle, onConfirm, onMove, onSoldOut, onRestock, canMove, isFirst, isLast, busy }) {
  const locked = item.removed;
  const adminHidden = item.visibility === "hidden_admin";
  const priced = ["fixed", "from", "range"].includes(item.priceType) && typeof item.price === "number";
  const canShow = item.visible && !item.draft ? "Hide" : "Show";
  return (
    <span className={styles.actions}>
      <label className={styles.pick}>
        <input type="checkbox" checked={selected} onChange={() => onSelect(item.id)} aria-label={`Select ${item.name}`} />
        <span aria-hidden="true">Select</span>
      </label>
      <span className={styles.actionsEnd}>
        {item.soldOut && (
          <button type="button" className={`${styles.mini} ${styles.primaryBtn}`} onClick={() => onRestock(item)} disabled={locked || busy}>Back in stock<span className={styles.sr}>: {item.name}</span></button>
        )}
        <button type="button" className={`${styles.mini} ${item.soldOut ? "" : styles.primaryBtn}`} onClick={() => onEdit(item)} disabled={locked || busy}>Edit<span className={styles.sr}> {item.name}</span></button>
        <Menu label={`More actions for ${item.name}`}>
          {(close) => (
            <>
              {!item.soldOut && <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { close(); onSoldOut(item); }} disabled={locked || busy}>Mark out of stock</button>}
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
              <a role="menuitem" className={styles.menuItem} href="/business/preview" target="_blank" rel="noreferrer" onClick={close}>View as customer</a>
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
