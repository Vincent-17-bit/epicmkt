import styles from "./CardGrid.module.css";

export default function CardGrid({ as: Tag = "ul", compact = false, className = "", children, ...rest }) {
  return (
    <Tag className={`${styles.grid} ${compact ? styles.compact : ""} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
