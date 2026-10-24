import { useEffect, useRef, useState } from "react";
import BrandMark from "./BrandMark.jsx";
import styles from "./Picture.module.css";

/**
 * A picture that can never distort its card. The EpicMKT mark sits underneath as the placeholder, so while the image
 * loads, when there is no image at all, or when it fails to load, the box looks the same: same size, same mark. The
 * image fades in over it once it has loaded. It fills its parent (which must be positioned and sized by the card),
 * so the picture never decides the card's shape.
 */
export default function Picture({ src, alt = "", className = "", imgClassName = "", eager = false, onFail }) {
  const [state, setState] = useState(src ? "loading" : "empty");
  const ref = useRef(null);

  useEffect(() => {
    setState(src ? "loading" : "empty");
  }, [src]);

  // A cached image can finish before React attaches its handlers.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth > 0) setState("loaded");
  }, [src]);

  const fail = () => {
    setState("failed");
    onFail?.();
  };

  return (
    <span className={`${styles.frame} ${className}`} data-state={state}>
      <span className={styles.placeholder} aria-hidden="true">
        <BrandMark className={styles.mark} />
      </span>
      {src && state !== "failed" && (
        <img
          ref={ref}
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable="false"
          className={`${styles.img} ${imgClassName}`}
          onLoad={() => setState("loaded")}
          onError={fail}
        />
      )}
    </span>
  );
}
