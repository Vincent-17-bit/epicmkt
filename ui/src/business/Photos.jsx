import { actionProps, isPreview } from "../preview.js";
import BusinessSection from "./BusinessSection.jsx";
import styles from "./Photos.module.css";

export default function Photos({ gallery, mode = "live", onOpen }) {
  const act = actionProps(isPreview(mode));

  return (
    <BusinessSection title="Photos" id="photos">
      <ul className={styles.gallery}>
        {gallery.map((photo, i) => (
          <li key={photo.id}>
            <button type="button" className={styles.thumb} {...act.button(() => onOpen?.(i))} aria-label={`Open photo: ${photo.caption}`}>
              <img src={photo.url} alt={photo.caption} loading="lazy" decoding="async" className={styles.thumbImg} />
            </button>
          </li>
        ))}
      </ul>
    </BusinessSection>
  );
}
