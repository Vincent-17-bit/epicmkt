import { mediaUrl } from "../../../api/shape.js";
import { priceText } from "./cardItem.js";
import { Actions, Chips, Ribbon, Signals } from "./parts.jsx";
import styles from "./catalog.module.css";

export default function ListRow({ item, selected, handlers, canMove, isFirst, isLast, busy, drag }) {
  const src = mediaUrl(item.imagePaths?.[0]);
  return (
    <li
      className={`${styles.row} ${item.visibility !== "showing" || item.soldOut ? styles.rowDim : ""} ${selected ? styles.rowSelected : ""}`}
      data-testid="listing"
      data-id={item.id}
      draggable={drag.enabled}
      onDragStart={(e) => drag.start(e, item.id)}
      onDragOver={(e) => drag.over(e, item.id)}
      onDrop={(e) => drag.drop(e, item.id)}
    >
      <span className={styles.thumb}>{src && <img src={src} alt="" loading="lazy" />}</span>
      <span className={styles.rowMain}>
        <span className={styles.rowName}>{item.name}</span>
        <span className={styles.rowMeta}>
          <span>{priceText(item)}</span>
          {item.section && <span>{item.section}</span>}
        </span>
        <Chips item={item} />
        <Ribbon item={item} />
      </span>
      <Signals item={item} />
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
    </li>
  );
}
