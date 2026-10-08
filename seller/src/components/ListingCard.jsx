import { Button, ProductCard } from "@epicmkt/ui";
import styles from "./ListingCard.module.css";

export default function ListingCard({ item, flags = {}, onToggleHidden, onEditPrice, onSelect }) {
  const chips = [
    flags.hiddenByMe && "Hidden by me",
    flags.removedByAdmin && "Removed by admin",
    flags.reports > 0 && `${flags.reports} ${flags.reports === 1 ? "report" : "reports"}`,
    flags.stalePrice && "Stale price"
  ].filter(Boolean);

  return (
    <ProductCard
      item={item}
      onSelect={onSelect}
      overlay={
        chips.length > 0 && (
          <div className={styles.flags}>
            {chips.map((chip) => (
              <span key={chip} className={styles.flag}>
                {chip}
              </span>
            ))}
          </div>
        )
      }
      quickActions={
        <>
          <Button size="sm" variant="secondary" onClick={() => onToggleHidden?.(item)} disabled={flags.removedByAdmin}>
            {flags.hiddenByMe ? "Show" : "Hide"}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onEditPrice?.(item)} disabled={flags.removedByAdmin}>
            Edit price
          </Button>
        </>
      }
    />
  );
}
