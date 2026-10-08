import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { BottomSheet } from "@epicmkt/ui";
import Button from "./Button.jsx";
import IconButton from "./IconButton.jsx";
import styles from "./FilterSheet.module.css";

export default function FilterSheet({ open, onClose, total, onClear, canClear, children }) {
  return (
    <BottomSheet open={open} onClose={onClose} labelledBy="filter-sheet-title" closeAbove="(min-width: 1024px)">
      {open && (
        <div className={styles.inner}>
          <div className={styles.head}>
            <h2 id="filter-sheet-title" className={styles.title}>
              Filters
            </h2>
            <IconButton icon={faXmark} label="Close filters" onClick={onClose} />
          </div>
          <div className={styles.body}>{children}</div>
          <div className={styles.foot}>
            {canClear && (
              <Button variant="ghost" onClick={onClear}>
                Clear all
              </Button>
            )}
            <Button variant="dark" className={styles.show} onClick={onClose}>
              {total == null ? "Show results" : `Show ${total} ${total === 1 ? "result" : "results"}`}
            </Button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
