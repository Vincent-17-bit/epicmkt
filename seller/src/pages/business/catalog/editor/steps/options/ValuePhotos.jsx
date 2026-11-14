import { useId, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCamera, faImages, faTrashCan, faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import { clearValuePhoto, setValuePhoto } from "@epicmkt/shared";
import s from "./options.module.css";

// One card per value of an option type ("Super loaf", "400g", "Large"): upload the photo that shows exactly that choice, or reuse
// one of the item's photos. It works before the item is saved too: the photo is queued and linked as soon as the item exists.
// The buyer's gallery jumps to this photo when they pick the value.
export default function ValuePhotos({ options, axis, set, media, announce }) {
  const uid = useId();
  const latest = useRef(options);
  latest.current = options;
  const [reusing, setReusing] = useState(null);
  const tiles = (media?.tiles ?? []).filter((t) => t.kind === "image");
  const saved = tiles.filter((t) => t.status === "saved" && t.id);
  const label = (axis.label || "option").toLowerCase();

  const tileOf = (v) => (v.mediaId ? tiles.find((t) => t.id === v.mediaId) : v.photoTile ? tiles.find((t) => t.key === v.photoTile) : null);

  const upload = async (v, file) => {
    if (!file) return;
    const keys = await media.manager.addFiles([file]);
    if (!keys?.[0]) return;
    set(setValuePhoto(latest.current, axis.key, v.id, { tile: keys[0] }));
    announce(`Photo added for ${v.label}.`);
  };
  const reuse = (v, tile) => {
    set(setValuePhoto(latest.current, axis.key, v.id, { mediaId: tile.id }));
    setReusing(null);
    announce(`Photo chosen for ${v.label}.`);
  };
  const clear = (v) => {
    set(clearValuePhoto(latest.current, axis.key, v.id));
    announce(`Photo removed from ${v.label}. It stays in the item's photos.`);
  };

  const done = axis.values.filter((v) => Boolean(tileOf(v))).length;

  return (
    <div className={s.stack} role="group" aria-label={`Photo for each ${label}`}>
      <div className={s.vpHead}>
        <span className={s.vpTitle}>Photo for each {label}</span>
        <span className={s.vpCount}>{done} of {axis.values.length} have a photo</span>
      </div>
      <p className={s.hint}>Optional. When a buyer picks one, the photos jump to its picture, so every {label} can look right.</p>
      <ul className={s.vpGrid}>
        {axis.values.map((v) => {
          const tile = tileOf(v);
          const busy = tile && tile.status !== "saved" && tile.status !== "ready";
          const inputId = `${uid}-${v.id}`;
          return (
            <li key={v.id} className={s.vpCard} data-has={tile ? "" : undefined}>
              <div className={s.vpFrame}>
                {tile ? <img className={s.vpImg} src={tile.url} alt={`${v.label} photo`} /> : (
                  <label className={s.vpEmpty} htmlFor={inputId}>
                    <FontAwesomeIcon icon={faCamera} aria-hidden="true" />
                    <span>Add photo</span>
                  </label>
                )}
                {busy && <span className={s.vpBusy} role="status">{tile.status === "error" ? "Failed" : "Uploading…"}</span>}
                {tile && !busy && <span className={s.vpTick} aria-hidden="true"><FontAwesomeIcon icon={faCircleCheck} /></span>}
              </div>
              <p className={s.vpName}>{v.label}</p>
              <input id={inputId} className={s.vpFile} type="file" accept="image/jpeg,image/png,image/webp"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; upload(v, f); }} />
              <div className={s.vpActions}>
                <label className={s.vpBtn} htmlFor={inputId}><FontAwesomeIcon icon={faCamera} aria-hidden="true" />{tile ? "Replace" : "Upload"}{" "}<span className={s.srOnly}>photo for {v.label}</span></label>
                {saved.length > 0 && (
                  <button type="button" className={s.vpBtn} aria-expanded={reusing === v.id} onClick={() => setReusing(reusing === v.id ? null : v.id)}>
                    <FontAwesomeIcon icon={faImages} aria-hidden="true" />Reuse{" "}<span className={s.srOnly}>an item photo for {v.label}</span>
                  </button>
                )}
                {tile && <button type="button" className={s.vpBtn} data-danger="" onClick={() => clear(v)}><FontAwesomeIcon icon={faTrashCan} aria-hidden="true" /><span className={s.srOnly}>Remove photo from {v.label}</span></button>}
              </div>
              {reusing === v.id && (
                <ul className={s.vpPick} aria-label={`Item photos to use for ${v.label}`}>
                  {saved.map((t, n) => (
                    <li key={t.key}><button type="button" className={s.vpPickBtn} data-on={v.mediaId === t.id ? "" : undefined} onClick={() => reuse(v, t)}><img src={t.url} alt={`Photo ${n + 1}`} /></button></li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
