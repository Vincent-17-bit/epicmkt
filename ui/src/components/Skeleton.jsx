import styles from "./Skeleton.module.css";

export default function Skeleton({ width = "100%", height = "1rem", radius, className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.skeleton} ${className}`}
      style={{ width, height, borderRadius: radius }}
    />
  );
}
