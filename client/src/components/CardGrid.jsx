import styles from "./CardGrid.module.css";

export default function CardGrid({ as: Tag = "ul", className = "", children, ...rest }) {
  return (
    <Tag className={`${styles.grid} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
