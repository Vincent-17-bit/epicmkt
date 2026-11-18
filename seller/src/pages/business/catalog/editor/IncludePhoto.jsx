import { useId, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCamera, faImages, faXmark } from "@fortawesome/free-solid-svg-icons";
import styles from "./editor.module.css";

// The optional photo of one "What's included" line. `photo` is { mediaId } (one of the item's photos), { tile } (a photo still
// uploading, linked when the item is saved) or null. A new photo is added to the item's photos as well, so it is saved with them.
export default function IncludePhoto({ media, photo, label, onChange }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const tiles = (media?.tiles ?? []).filter((t) => t.kind === "image" && t.url);
  const tile = photo?.mediaId ? tiles.find((t) => t.id === photo.mediaId) : photo?.tile ? tiles.find((t) => t.key === photo.tile) : null;
  const upload = async (file) => {
    if (!file || !media?.manager) return;
    const keys = await media.manager.addFiles([file]);
    if (keys?.[0]) onChange({ tile: keys[0] });
    setOpen(false);
  };
  const pick = (t) => { onChange(t.id ? { mediaId: t.id } : { tile: t.key }); setOpen(false); };
  if (!media) return null;
  return (
    <div className={styles.incPhoto}>
      <button type="button" className={styles.incThumb} data-has={tile ? "" : undefined} aria-expanded={open} aria-controls={`${uid}-pick`}
        onClick={() => setOpen((v) => !v)} title={tile ? "Change the photo" : "Add a photo (optional)"}>
        {tile ? <img src={tile.url} alt={`Photo for ${label}`} /> : <><FontAwesomeIcon icon={faCamera} aria-hidden="true" /><span>Photo</span></>}
      </button>
      {tile && (
        <button type="button" className={styles.incClear} onClick={() => onChange(null)} aria-label={`Remove the photo from ${label}`} title="Remove the photo (it stays in the item's photos)">
          <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
        </button>
      )}
      {open && (
        <div id={`${uid}-pick`} className={styles.incPick} role="group" aria-label={`Photo for ${label}`}>
          <label className={styles.incUpload}>
            <FontAwesomeIcon icon={faCamera} aria-hidden="true" /> Upload a new photo
            <input type="file" accept="image/jpeg,image/png,image/webp" className={styles.srFile} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; upload(f); }} />
          </label>
          {tiles.length > 0 ? (
            <>
              <p className={styles.hint}><FontAwesomeIcon icon={faImages} aria-hidden="true" /> Or use one of this item's photos:</p>
              <ul className={styles.incGrid}>
                {tiles.map((t, n) => (
                  <li key={t.key}>
                    <button type="button" className={styles.incPickBtn} data-on={tile?.key === t.key ? "" : undefined} onClick={() => pick(t)}>
                      <img src={t.url} alt={`Item photo ${n + 1}`} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : <p className={styles.hint}>Photos you add to Media also show here.</p>}
        </div>
      )}
    </div>
  );
}
