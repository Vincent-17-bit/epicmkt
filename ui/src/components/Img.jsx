import styles from "./Img.module.css";

export default function Img({ src, alt, width, height, ratio, priority = false, className = "", ...rest }) {
  return (
    <span className={`${styles.box} ${className}`} style={{ aspectRatio: ratio ?? `${width} / ${height}` }}>
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className={styles.img}
        {...rest}
      />
    </span>
  );
}
