import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { BottomSheet } from "@epicmkt/ui";
import Button from "./Button.jsx";
import IconButton from "./IconButton.jsx";
import styles from "./FilterSheet.module.css";

export default function FilterSheet({
  open,
  onClose,
  total,
  onClear,
  canClear,
  children,
  title = "Filters",
  noun = ["result", "results"],
  closeAbove = "(min-width: 1024px)",
  className = ""
}) {
  return (
    <BottomSheet open={open} onClose={onClose} labelledBy="filter-sheet-title" closeAbove={closeAbove} className={className}>
      {open && (
        <div className={styles.inner}>
          <div className={styles.head}>
            <h2 id="filter-sheet-title" className={styles.title}>
              {title}
            </h2>
            <IconButton icon={faXmark} label={`Close ${title.toLowerCase()}`} onClick={onClose} />
          </div>
          <div className={styles.body}>{children}</div>
          <div className={styles.foot}>
            {canClear && (
              <Button variant="ghost" onClick={onClear}>
                Clear all
              </Button>
            )}
            <Button variant="dark" className={styles.show} onClick={onClose} data-empty={total === 0 || undefined}>
              <span key={total} className={styles.count} role="status" aria-live="polite">
                {total == null ? "Show results" : total === 0 ? `No ${noun[1]} match` : `Show ${total} ${total === 1 ? noun[0] : noun[1]}`}
              </span>
            </Button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
