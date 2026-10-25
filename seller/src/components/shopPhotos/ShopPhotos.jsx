import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCamera, faImage } from "@fortawesome/free-solid-svg-icons";
import * as api from "../../api/index.js";
import { mediaUrl } from "../../api/shape.js";
import { SHOP_IMAGES } from "../../lib/imageCrop.js";
import { ACCEPT, hasTouchCamera, loadPhoto, releasePhoto } from "../../lib/photoCanvas.js";
import { initialsOf } from "../../lib/initials.js";
import { errorText } from "../../lib/errors.js";
import ui from "../../styles/ui.module.css";
import CropDialog from "./CropDialog.jsx";
import PhotoSourceSheet from "./PhotoSourceSheet.jsx";
import styles from "./shopPhotos.module.css";

// A picture that falls back to `fallback` if the file cannot be loaded (deleted, offline, blocked).
function Pic({ src, className, fallback = null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  if (!src || failed) return fallback;
  return <img src={src} alt="" className={className} onError={() => setFailed(true)} decoding="async" />;
}

const SAVED = { logo: "Your logo is updated.", cover: "Your cover photo is updated." };
const REMOVED = { logo: "Your logo was removed.", cover: "Your cover photo was removed." };

// Where a seller sets the two pictures customers see first. The preview is laid out like the real shop page, so what
// they see here is what customers get. Each picture has a camera badge that opens Camera / Photo / Remove, the same way
// WhatsApp Business does. A new picture is framed in the cropper and only the framed crop is uploaded.
export default function ShopPhotos({ business }) {
  const qc = useQueryClient();
  const [sheet, setSheet] = useState(null); // "logo" | "cover" | null: which picture the sheet is for
  const [job, setJob] = useState(null); // { kind, photo } while the cropper is open
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const pending = useRef(null); // the picture a file is being picked for (the sheet is already closed by then)
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const jobRef = useRef(null);
  jobRef.current = job;
  useEffect(() => () => releasePhoto(jobRef.current?.photo), []);

  const canCamera = hasTouchCamera();
  const logoUrl = mediaUrl(business.logoPath);
  const coverUrl = mediaUrl(business.coverPath);
  const spec = sheet ? SHOP_IMAGES[sheet] : null;
  const has = { logo: Boolean(business.logoPath), cover: Boolean(business.coverPath) };

  const open = (kind) => {
    setNotice("");
    setError("");
    setSheet(kind);
  };

  // These two start the picker inside the tap that chose them, which browsers require, then close the sheet.
  const pick = (ref) => () => {
    pending.current = sheet;
    ref.current?.click();
    setSheet(null);
  };

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ["subscription"] }),
    qc.invalidateQueries({ queryKey: ["shop-preview"] }),
  ]);

  const onPicked = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const kind = pending.current;
    if (!file || !kind) return;
    setBusy(true);
    try {
      setJob({ kind, photo: await loadPhoto(file, SHOP_IMAGES[kind]) });
    } catch (err) {
      setError(errorText(err, "We could not open that photo. Try another one."));
    } finally {
      setBusy(false);
    }
  };

  const closeJob = () => {
    releasePhoto(job?.photo);
    setJob(null);
  };

  const save = async (blob) => {
    await api.uploadShopImage(job.kind, blob); // a failure is shown inside the cropper, which stays open to try again
    await refresh();
    setNotice(SAVED[job.kind]);
    closeJob();
  };

  const remove = async () => {
    const kind = sheet;
    setSheet(null);
    setBusy(true);
    try {
      await api.removeShopImage(kind);
      await refresh();
      setNotice(REMOVED[kind]);
    } catch (err) {
      setError(errorText(err, "We could not remove that photo. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const initials = initialsOf(business.name);

  return (
    <section className={ui.card} aria-labelledby="photos-title">
      <h2 id="photos-title">Shop photos</h2>
      <p className={ui.muted}>This is how the top of your shop page looks to customers.</p>

      <div className={styles.stage}>
        <div className={styles.cover}>
          <Pic
            src={coverUrl}
            className={styles.coverImg}
            fallback={(
              <button type="button" className={styles.coverEmpty} onClick={() => open("cover")} disabled={busy}>
                <FontAwesomeIcon icon={faImage} aria-hidden="true" />
                <span>Add a cover photo</span>
              </button>
            )}
          />
          <button type="button" className={`${styles.badge} ${styles.badgeCover}`} onClick={() => open("cover")} disabled={busy} aria-label="Change cover photo">
            <FontAwesomeIcon icon={faCamera} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.identity}>
          <div className={styles.avatarWrap}>
            <span className={styles.avatar}>
              <Pic src={logoUrl} className={styles.avatarImg} fallback={<span aria-hidden="true">{initials}</span>} />
            </span>
            <button type="button" className={`${styles.badge} ${styles.badgeLogo}`} onClick={() => open("logo")} disabled={busy} aria-label="Change shop logo">
              <FontAwesomeIcon icon={faCamera} aria-hidden="true" />
            </button>
          </div>
          <div className={styles.meta}>
            <strong>{business.name}</strong>
          </div>
        </div>
      </div>

      {busy && !job && <p className={ui.muted} role="status">Working</p>}
      {notice && <p className={styles.ok} role="status">{notice}</p>}
      {error && <p className={ui.error} role="alert">{error}</p>}

      <ul className={styles.tips}>
        <li>Cover: a wide photo of your shop or your best products. You choose which part shows.</li>
        <li>Logo: your sign or a clear close-up. It is shown as a circle.</li>
      </ul>

      {/* The two ways to get a picture. Camera opens the phone camera straight away; Photo opens the gallery or files. */}
      <input ref={galleryRef} type="file" accept={ACCEPT} className={styles.hidden} tabIndex={-1} onChange={onPicked} data-testid="photo-input" />
      <input ref={cameraRef} type="file" accept="image/*" capture={spec?.capture ?? "environment"} className={styles.hidden} tabIndex={-1} onChange={onPicked} data-testid="camera-input" />

      <PhotoSourceSheet
        spec={spec}
        hasImage={sheet ? has[sheet] : false}
        canCamera={canCamera}
        onCamera={pick(cameraRef)}
        onGallery={pick(galleryRef)}
        onRemove={remove}
        onClose={() => setSheet(null)}
      />

      {job && <CropDialog key={job.photo.url} spec={SHOP_IMAGES[job.kind]} photo={job.photo} onCancel={closeJob} onSave={save} />}
    </section>
  );
}
