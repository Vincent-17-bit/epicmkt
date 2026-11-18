import { useId, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCamera, faImages, faXmark } from "@fortawesome/free-solid-svg-icons";
import styles from "./editor.module.css";

// The optional picture of one "What's included" line. `photo` is:
//   { pending: key }   a new picture chosen on this device, uploaded on Save as a page picture (migration 0138): it does not use a photo
//                      slot and does not show among the item's photos;
//   { mediaId }        a saved page picture, or one of the item's photos picked from the list;
//   { tile }           one of the item's photos still uploading (linked when the item is saved);
//   null               no picture.
export default function IncludePhoto({ media, extras, photo, label, onChange }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState("");
  const tiles = (media?.tiles ?? []).filter((t) => t.kind === "image" && t.url);
  const fromTiles = photo?.mediaId ? tiles.find((t) => t.id === photo.mediaId) : photo?.tile ? tiles.find((t) => t.key === photo.tile) : null;
  const fromExtras = extras && (photo?.pending || photo?.mediaId) ? extras.pic(photo) : null;
  const url = fromExtras?.url ?? fromTiles?.url ?? null;
  const upload = async (file) => {
    setProblem("");
    if (!file || !extras) return;
    const r = await extras.add(file);
    if (r.error) { setProblem(r.error); return; }
    onChange({ pending: r.key });
    setOpen(false);
  };
  const pick = (t) => { onChange(t.id ? { mediaId: t.id } : { tile: t.key }); setOpen(false); };
  if (!media && !extras) return null;
  return (
    <div className={styles.incPhoto}>
      <button type="button" className={styles.incThumb} data-has={url ? "" : undefined} aria-expanded={open} aria-controls={`${uid}-pick`}
        onClick={() => setOpen((v) => !v)} title={url ? "Change the picture" : "Add a picture (optional)"}>
        {url ? <img src={url} alt={`Picture for ${label}`} /> : <><FontAwesomeIcon icon={faCamera} aria-hidden="true" /><span>Picture</span></>}
      </button>
      {photo && (
        <button type="button" className={styles.incClear} onClick={() => onChange(null)} aria-label={`Remove the picture from ${label}`} title="Remove the picture">
          <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
        </button>
      )}
      {problem && <p className={styles.error} role="alert">{problem}</p>}
      {open && (
        <div id={`${uid}-pick`} className={styles.incPick} role="group" aria-label={`Picture for ${label}`}>
          {extras && (
            <label className={styles.incUpload}>
              <FontAwesomeIcon icon={faCamera} aria-hidden="true" /> Upload a picture
              <input type="file" accept="image/jpeg,image/png,image/webp" className={styles.srFile} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; upload(f); }} />
            </label>
          )}
          <p className={styles.hint}>It does not use one of your photo slots. Give the line a name: buyers see it under the picture.</p>
          {tiles.length > 0 && (
            <>
              <p className={styles.hint}><FontAwesomeIcon icon={faImages} aria-hidden="true" /> Or use one of this item's photos:</p>
              <ul className={styles.incGrid}>
                {tiles.map((t, n) => (
                  <li key={t.key}>
                    <button type="button" className={styles.incPickBtn} data-on={fromTiles?.key === t.key ? "" : undefined} onClick={() => pick(t)}>
                      <img src={t.url} alt={`Item photo ${n + 1}`} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
