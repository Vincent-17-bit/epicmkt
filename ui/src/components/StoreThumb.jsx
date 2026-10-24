import { useEffect, useState } from "react";
import LazyImage from "./LazyImage.jsx";
import styles from "./StoreThumb.module.css";

/**
 * A store's picture for a card: its cover photo, or when it has none (a business that was just added) or the photo
 * fails to load, its logo, or failing that the EpicMKT placeholder. Whatever the store brings, it always fills its
 * box with something that belongs there, and the box never changes size.
 */
export default function StoreThumb({ coverUrl, logoUrl, className = "" }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => setCoverFailed(false), [coverUrl]);
  useEffect(() => setLogoFailed(false), [logoUrl]);

  const showCover = Boolean(coverUrl) && !coverFailed;
  const showLogo = !showCover && Boolean(logoUrl) && !logoFailed;

  return (
    <span className={`${styles.thumb} ${className}`} data-kind={showCover ? "cover" : showLogo ? "logo" : "placeholder"}>
      {showCover && <LazyImage fill src={coverUrl} width={480} onError={() => setCoverFailed(true)} />}
      {showLogo && (
        <span className={styles.logoBox}>
          <LazyImage fill src={logoUrl} width={240} onError={() => setLogoFailed(true)} />
        </span>
      )}
      {!showCover && !showLogo && <LazyImage fill src={null} />}
    </span>
  );
}
