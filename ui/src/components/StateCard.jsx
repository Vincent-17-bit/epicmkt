import styles from "./StateCard.module.css";

/**
 * The card shown in place of a list that failed to load or came back empty: one message and, below it, the action.
 * Pass `role="alert"` for an error. `size="snug"` is the tighter padding used inside home sections.
 */
export default function StateCard({ message, role, size = "roomy", className = "", children }) {
  return (
    <div className={`${styles.card} ${styles[size]} ${className}`} role={role}>
      <p>{message}</p>
      {children}
    </div>
  );
}
