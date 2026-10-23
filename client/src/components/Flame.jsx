import styles from "./Flame.module.css";

export default function Flame({ className = "" }) {
  return (
    <svg
      role="img"
      aria-label="Trending now"
      viewBox="0 0 24 24"
      className={`${styles.flame} ${className}`}
    >
      <path
        className={styles.outer}
        d="M12 1.5c.7 3.2 3.2 4.8 4.8 7.1 1.4 2 2.3 3.9 2.3 6.2a7.1 7.1 0 0 1-14.2 0c0-2.2.8-3.8 1.9-5.2.4 1.3 1 2.1 1.9 2.5C8.4 8.8 9.6 4.5 12 1.5z"
      />
      <path
        className={styles.middle}
        d="M12 7.8c.4 2.3 2.5 3.4 3.4 5.2.8 1.6.7 3.4-.4 4.8a4.3 4.3 0 0 1-6.2.3c-1-1.2-.9-2.9-.1-4.2.3.6.7 1 1.3 1.2.1-2.4 1-4.4 2-7.3z"
      />
      <path
        className={styles.core}
        d="M12 13.2c.2 1.3 1.4 1.9 1.8 2.9.4 1 .1 2-.7 2.6a2.2 2.2 0 0 1-3-.5c-.5-.8-.4-1.6 0-2.3.2.3.5.5.8.6.1-1.3.6-2.3 1.1-3.3z"
      />
    </svg>
  );
}
