import styles from "./SaveButton.module.css";

/**
 * The Save heart. Presentational: the client decides what "saved" means and passes `saved` and `onToggle`; this package never
 * reads storage. It is always its own button, never inside a link, and a tap on it stops here: it cannot reach the card's link,
 * so saving never opens the item or logs a card click.
 */
export default function SaveButton({
  saved = false,
  onToggle,
  label,
  size = 20,
  className = "",
}) {
  const handle = (e) => {
    e.stopPropagation();
    e.preventDefault();
    onToggle?.(!saved);
  };
  return (
    <button
      type="button"
      className={`${styles.btn} ${saved ? styles.saved : ""} ${className}`}
      aria-pressed={saved}
      aria-label={label}
      onClick={handle}
    >
      <svg
        className={styles.icon}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8.2 3.4 5 6.6 5c1.9 0 3.5 1 4.4 2.5h2C13.9 6 15.5 5 17.4 5c3.2 0 5.1 3.2 3.9 6.3-1.8 4.6-9.3 9.2-9.3 9.2z"
          fill={saved ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
