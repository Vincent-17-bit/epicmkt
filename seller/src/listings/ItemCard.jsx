import { memo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDown, faArrowUp, faCircleCheck, faCopy, faEye, faEyeSlash, faFlag, faPen, faDesktop } from "@fortawesome/free-solid-svg-icons";
import { ProductCard } from "@epicmkt/ui";
import { cardLabels, describeItem, toCardItem } from "./cardModel.js";
import styles from "./listings.module.css";

const Action = ({ icon, label, onClick, disabled }) => (
  <button type="button" className={styles.action} onClick={onClick} disabled={disabled} aria-label={label} title={label}>
    <FontAwesomeIcon icon={icon} aria-hidden="true" />
    <span className={styles.actionText}>{label}</span>
  </button>
);

function ItemCard({ item, ctx, layout = "card", selected, onSelect, canReorder, onMove, isFirst, isLast, onEdit, onDuplicate, onToggle, onConfirm, onView, drag }) {
  const info = describeItem(item, ctx);
  const sale = item.price !== null && item.salePrice !== null && item.salePrice < item.price;
  const removed = item.removedByAdmin;
  const dragProps = canReorder ? { draggable: true, onDragStart: () => drag.start(item.id), onDragOver: (e) => e.preventDefault(), onDrop: (e) => { e.preventDefault(); drag.drop(item.id); } } : {};

  const overlay = (
    <div className={styles.media} data-sale={sale ? "true" : undefined}>
      <div className={styles.topRight}>
        <label className={styles.check}>
          <input type="checkbox" checked={selected} onChange={() => onSelect(item.id)} aria-label={`Select ${item.name}`} />
        </label>
        {info.flagged && (
          <span className={styles.flag} role="img" aria-label="Flagged">
            <FontAwesomeIcon icon={faFlag} aria-hidden="true" />
          </span>
        )}
      </div>
      <div className={styles.bottom}>
        {canReorder && (
          <span className={styles.move}>
            <button type="button" className={styles.moveBtn} onClick={() => onMove(item.id, -1)} disabled={isFirst} aria-label={`Move ${item.name} up`}>
              <FontAwesomeIcon icon={faArrowUp} aria-hidden="true" />
            </button>
            <button type="button" className={styles.moveBtn} onClick={() => onMove(item.id, 1)} disabled={isLast} aria-label={`Move ${item.name} down`}>
              <FontAwesomeIcon icon={faArrowDown} aria-hidden="true" />
            </button>
          </span>
        )}
      </div>
      {info.ribbon && (
        <div className={styles.ribbon} data-tone={info.ribbon.tone} data-testid="ribbon" title={info.ribbon.reason ? `${info.ribbon.text}: ${info.ribbon.reason}` : info.ribbon.text}>
          <strong>{info.ribbon.text}</strong>
        </div>
      )}
    </div>
  );

  const actions = (
    <>
      <div className={styles.signals}>
        <span className={styles.pill} data-kind="availability">{info.availabilityLabel}</span>
        {info.reportsText && <span className={styles.pill} data-kind="danger">{info.reportsText}</span>}
        {info.lowStock && <span className={styles.pill} data-kind="warn">{info.lowStock}</span>}
        {info.stale && <span className={styles.pill} data-kind="warn">Price may be out of date</span>}
      </div>
      {info.ribbon?.reason && <p className={styles.reason} data-tone={info.ribbon.tone} data-testid="reason">{info.ribbon.reason}</p>}
      <Action icon={faPen} label="Edit" onClick={() => onEdit(item)} disabled={removed} />
      <Action icon={faCopy} label="Duplicate" onClick={() => onDuplicate(item)} disabled={removed} />
      <Action icon={item.visible ? faEyeSlash : faEye} label={item.visible && !item.draft ? "Hide" : "Show"} onClick={() => onToggle(item)} disabled={info.locked} />
      <Action icon={faCircleCheck} label="Confirm price" onClick={() => onConfirm(item)} disabled={info.locked} />
      <Action icon={faDesktop} label="View as customer" onClick={() => onView(item)} />
    </>
  );

  return (
    <div className={styles.cell} data-layout={layout} data-dimmed={info.dimmed ? "true" : undefined} data-selected={selected ? "true" : undefined} data-visibility={info.visibility} {...dragProps}>
      <ProductCard item={toCardItem(item)} labels={cardLabels(item.availability)} onSelect={() => onEdit(item)} overlay={overlay} quickActions={actions} />
    </div>
  );
}

export default memo(ItemCard);
