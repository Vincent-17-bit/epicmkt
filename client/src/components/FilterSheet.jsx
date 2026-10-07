import { useEffect } from "react";
import { BottomSheet, Button } from "@epicmkt/ui";
import styles from "./FilterSheet.module.css";

export default function FilterSheet({ open, onClose, total, onClear, canClear, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const query = window.matchMedia("(min-width: 1024px)");
    const onChange = () => query.matches && onClose();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [open, onClose]);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Filters"
      titleId="filter-sheet-title"
      closeLabel="Close filters"
      footer={
        <>
          {canClear && (
            <Button variant="ghost" onClick={onClear}>
              Clear all
            </Button>
          )}
          <Button variant="dark" className={styles.show} onClick={onClose}>
            {total == null ? "Show results" : `Show ${total} ${total === 1 ? "result" : "results"}`}
          </Button>
        </>
      }
    >
      {children}
    </BottomSheet>
  );
}
