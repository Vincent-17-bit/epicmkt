import styles from "./Container.module.css";

export default function Container({ as: Tag = "div", className = "", children, ...rest }) {
  return (
    <Tag className={`${styles.container} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
