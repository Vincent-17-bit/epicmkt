import { useId, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faArrowRight, faCirclePlus, faImage, faTrashCan, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { SHARP_WIDTH } from "@epicmkt/shared";
import styles from "./sections.module.css";

// Pictures of the page sections (Images, From the brand). Each is shown whole inside a frame of a fixed shape, the same frame the buyer's
// page uses, so the seller sees exactly how much space it takes. A picture is never stretched: a different shape gets plain bands.

/** One picture in its frame. `pic` is what useExtras().pic(ref) returns. */
export function PictureFrame({ pic, ratio = "16 / 9", alt = "", label }) {
  return (
    <div className={styles.frame} style={{ aspectRatio: ratio }} data-empty={pic?.url ? undefined : ""}>
      {pic?.url ? <img src={pic.url} alt={alt} loading="lazy" decoding="async" /> : <span className={styles.frameEmpty}><FontAwesomeIcon icon={faImage} aria-hidden="true" />{label ?? "Picture missing"}</span>}
      {pic?.small && (
        <span className={styles.small} title={`${pic.width} px wide. Pictures under ${SHARP_WIDTH} px look soft on big screens.`}>
          <FontAwesomeIcon icon={faTriangleExclamation} aria-hidden="true" /> Small ({pic.width} px)
        </span>
      )}
    </div>
  );
}

/** "Add pictures": picks up to `left` files and hands back their keys (useExtras().add). Problems are shown under the button. */
export function AddPictures({ extras, left, multiple = true, label = "Add pictures", onAdded, disabled = false }) {
  const uid = useId();
  const input = useRef(null);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const take = async (files) => {
    setProblem("");
    const list = [...files].slice(0, Math.max(0, left));
    if (files.length > list.length) setProblem(`Only ${left} more ${left === 1 ? "picture fits" : "pictures fit"} here, so the rest were left out.`);
    setBusy(true);
    const keys = [];
    for (const f of list) {
      const r = await extras.add(f);
      if (r.error) setProblem(r.error);
      else keys.push(r.key);
    }
    setBusy(false);
    if (keys.length) onAdded(keys);
  };
  const off = disabled || busy || left <= 0;
  return (
    <div className={styles.addWrap}>
      <button type="button" className={styles.add} onClick={() => input.current?.click()} disabled={off} aria-describedby={problem ? `${uid}-p` : undefined}>
        <FontAwesomeIcon icon={faCirclePlus} aria-hidden="true" /> {busy ? "Adding…" : label}
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple={multiple} hidden
        onChange={(e) => { const f = e.target.files; take(f ? [...f] : []); e.target.value = ""; }} />
      {problem && <p id={`${uid}-p`} className={styles.problem} role="alert">{problem}</p>}
    </div>
  );
}

/** Move left, move right and remove, for one picture card. */
export function CardTools({ index, count, name, onMove, onRemove }) {
  return (
    <div className={styles.tools}>
      <button type="button" className={styles.tool} onClick={() => onMove(index - 1)} disabled={index === 0} aria-label={`Move ${name} earlier`} title="Move earlier">
        <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
      </button>
      <button type="button" className={styles.tool} onClick={() => onMove(index + 1)} disabled={index === count - 1} aria-label={`Move ${name} later`} title="Move later">
        <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
      </button>
      <button type="button" className={styles.toolDanger} onClick={onRemove} aria-label={`Remove ${name}`} title="Remove">
        <FontAwesomeIcon icon={faTrashCan} aria-hidden="true" />
      </button>
    </div>
  );
}

export const moveIn = (list, from, to) => {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
};
