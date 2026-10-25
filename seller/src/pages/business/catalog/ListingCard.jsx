import { ItemCard } from "@epicmkt/ui";
import { cardItemOf } from "./cardItem.js";
import { Actions, Chips, Ribbon, Signals } from "./parts.jsx";
import styles from "./catalog.module.css";

export default function ListingCard({ item, selected, handlers, canMove, isFirst, isLast, busy, drag }) {
  const overlay = (
    <>
      <span className={styles.overlayTop}><span /><Signals item={item} /></span>
      <span className={styles.overlayBottom}>
        <Chips item={item} />
        <Ribbon item={item} />
      </span>
    </>
  );
  const quickActions = (
    <Actions
      item={item}
      selected={selected}
      busy={busy}
      canMove={canMove}
      isFirst={isFirst}
      isLast={isLast}
      onSelect={handlers.select}
      onEdit={handlers.edit}
      onDuplicate={handlers.duplicate}
      onToggle={handlers.toggle}
      onConfirm={handlers.confirm}
      onMove={handlers.move}
      onSoldOut={handlers.soldOut}
      onRestock={handlers.restock}
    />
  );
  return (
    <li
      className={styles.cell}
      data-testid="listing"
      data-id={item.id}
      draggable={drag.enabled}
      onDragStart={(e) => drag.start(e, item.id)}
      onDragOver={(e) => drag.over(e, item.id)}
      onDrop={(e) => drag.drop(e, item.id)}
    >
      <ItemCard
        item={cardItemOf(item)}
        onSelect={() => handlers.select(item.id)}
        overlay={overlay}
        quickActions={quickActions}
        dimmed={item.visibility !== "showing" || item.soldOut}
        selected={selected}
        labels={{ was: "Was", lowStock: "Low stock", onlyLeft: "Only {n} left" }}
      />
    </li>
  );
}
