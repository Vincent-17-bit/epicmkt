import { useEffect, useRef } from "react";
import { useSavedCount } from "../../stores/saved.js";
import { useAnnounce } from "../../stores/savedAnnounce.js";
import { t } from "../../i18n/index.js";
import { fill } from "./text.js";
import { loadSavedDrawer } from "./lazy.js";
import { SAVED_ID, useSavedDrawer } from "./useSavedDrawer.js";
import styles from "./HeaderSaved.module.css";

// The heart in the header, between the location button and the menu. It reads local storage only: no network call. Its badge is the count.
export default function HeaderSaved() {
  const count = useSavedCount();
  const { isOpen, open, close } = useSavedDrawer();
  const message = useAnnounce((s) => s.message);
  const before = useRef(count);
  const grew = count > before.current;
  useEffect(() => {
    before.current = count;
  }, [count]);
  const warm = () => {
    loadSavedDrawer().catch(() => {});
  };
  const label = count > 0 ? fill("saved.button", { count: String(count) }) : t("saved.buttonNone");

  return (
    <>
      <button
        type="button"
        className={styles.btn}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={SAVED_ID}
        aria-label={label}
        onClick={isOpen ? close : open}
        onPointerEnter={warm}
        onPointerDown={warm}
        onFocus={warm}
        data-testid="header-saved"
      >
        <span className={styles.iconWrap}>
          <svg className={styles.icon} width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8.2 3.4 5 6.6 5c1.9 0 3.5 1 4.4 2.5h2C13.9 6 15.5 5 17.4 5c3.2 0 5.1 3.2 3.9 6.3-1.8 4.6-9.3 9.2-9.3 9.2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          {count > 0 && (
            <span key={grew ? `up-${count}` : "still"} className={styles.badge} data-bump={grew ? "true" : undefined} aria-hidden="true" data-testid="saved-badge">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </span>
        <span className={styles.word}>{t("saved.word")}</span>
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {message}
      </span>
    </>
  );
}
